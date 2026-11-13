"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getReplyDetail, insertPastedReply, replyToInput, saveClassification, saveCorrection } from "@/db/queries";
import type { CorrectionAction } from "@/db/schema";
import { CATEGORY_LABELS, isCategory, type Category } from "@/lib/categories";
import { classify, MAX_BODY_CHARS } from "@/lib/classifier/classify";
import { groqProvider } from "@/lib/classifier/providers";
import { isValidIsoDate } from "@/lib/dates";

// Where a review action can send the person back to: the landing page (the queue) or a reply's detail page.
// Anything else falls back to the queue.
function safeReturnTo(raw: unknown): string {
  const s = String(raw ?? "");
  return s === "/" || /^\/replies\/[A-Za-z0-9-]+$/.test(s) ? s : "/";
}

/** Back to the page, with a short confirmation (or error) message shown at the top. */
function done(returnTo: string, message: string, kind: "ok" | "error" = "ok"): never {
  const q = new URLSearchParams({ notice: message.slice(0, 160) });
  if (kind === "error") q.set("kind", "error");
  redirect(`${returnTo}?${q}`);
}

/**
 * Every review action is one `corrections` row (POLICY.md section 5, CLAUDE.md "Database"). The server re-checks
 * that the action is allowed for the reply's CURRENT state, so a stale page, a double click or a hand-made request
 * can't write a row that doesn't make sense (e.g. confirming a payment that was already confirmed).
 *
 *   recategorize     any reply, to any other category           (detail page, or Needs human in the queue)
 *   confirm_paid     paid, in review                             → leaves the queue
 *   reject_paid      paid, in review                             → becomes needs_human, still in the queue
 *   resolve_offline  dispute, in review                          → leaves the queue
 */
export async function reviewAction(formData: FormData) {
  const replyId = String(formData.get("replyId") ?? "");
  // Two ways in: a button (intent + to), or the single action dropdown ("<action>" or "recategorize:<category>").
  const [choiceIntent, choiceTo] = String(formData.get("choice") ?? "").split(":");
  const intent = String(formData.get("intent") ?? "") || choiceIntent || "";
  const returnTo = safeReturnTo(formData.get("returnTo"));

  const detail = await getReplyDetail(replyId);
  if (!detail || !detail.shownCategory) return done(returnTo, "That reply isn’t available to act on.", "error");
  const shown = detail.shownCategory;
  const inReview = detail.status === "in_review";
  const label = `#${replyId}`;

  let action: CorrectionAction;
  let to: Category;
  let message: string;

  switch (intent) {
    case "recategorize": {
      const target = formData.get("to") ?? choiceTo;
      if (!isCategory(target)) return done(returnTo, "Pick a category.", "error");
      if (target === shown) return done(returnTo, `${label} is already ${CATEGORY_LABELS[shown]}. Pick a different category.`, "error");
      action = "recategorize";
      to = target;
      message =
        target === "paid"
          ? `${label} marked Paid and confirmed.`
          : `${label} moved to ${CATEGORY_LABELS[target]}.`;
      break;
    }
    case "confirm_paid":
      if (shown !== "paid" || !inReview) return done(returnTo, `${label} isn’t waiting for payment confirmation.`, "error");
      action = "confirm_paid";
      to = "paid";
      message = `${label} payment confirmed.`;
      break;
    case "reject_paid":
      if (shown !== "paid" || !inReview) return done(returnTo, `${label} isn’t waiting for payment confirmation.`, "error");
      action = "reject_paid";
      to = "needs_human";
      message = `${label}: payment not found. It’s back in Needs human.`;
      break;
    case "resolve_offline":
      if (shown !== "dispute" || !inReview) return done(returnTo, `${label} isn’t waiting to be settled.`, "error");
      action = "resolve_offline";
      to = "dispute";
      message = `${label} marked resolved offline.`;
      break;
    default:
      return done(returnTo, "That action isn’t available.", "error");
  }

  await saveCorrection({ replyId, action, fromCategory: shown, toCategory: to, note: null });
  // Refresh everything that shows this reply: the queue, the list, the nav count and its detail page.
  revalidatePath("/");
  revalidatePath("/replies");
  revalidatePath(`/replies/${replyId}`);
  return done(returnTo, message);
}

/** "2026-11-15T09:30" in the browser's own time zone → the moment it names. `offsetMin` is getTimezoneOffset(). */
function localToDate(local: string, offsetMin: number): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi) + offsetMin * 60_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Sort a pasted reply: store it (source = pasted), run the same classify() as the batch script, store the result
 * (or the failure), then show it on the Try a reply page. The invoice fields stay required (the paid recheck needs
 * them); the form prefills a sample invoice. A one-time submissionId becomes the reply id, so a repeated submission
 * (double click, back button) creates nothing and calls no model.
 */
export async function sortPastedReply(formData: FormData) {
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const body = field("body");
  const invoiceNumber = field("invoiceNumber");
  const amount = Number(field("invoiceAmount").replace(/[$,]/g, ""));
  const dueDate = field("dueDate");

  const fail = (message: string): never => redirect(`/try?error=${encodeURIComponent(message)}`);
  if (!body) fail("Paste a reply first.");
  if (body.length > MAX_BODY_CHARS) fail(`That reply is ${body.length} characters; the limit is ${MAX_BODY_CHARS}.`);
  if (!invoiceNumber) fail("Enter an invoice number.");
  if (!Number.isFinite(amount) || amount <= 0) fail("Enter an invoice amount greater than 0.");
  if (!isValidIsoDate(dueDate)) fail("Enter a valid due date.");

  // When the reply "arrived": the browser sends its local time plus its UTC offset; default to now.
  const offset = Number(field("tzOffset"));
  const receivedAt = localToDate(field("receivedAt"), Number.isFinite(offset) ? offset : 0) ?? new Date();

  const sent = field("submissionId");
  const id = `P-${/^[0-9a-f]{6}$/.test(sent) ? sent : randomBytes(3).toString("hex")}`;
  const created = await insertPastedReply({
    id,
    sender: field("sender") || "Pasted reply",
    customer: "Pasted reply",
    subject: field("subject") || "Pasted reply",
    body,
    receivedAt,
    invoiceNumber,
    invoiceAmount: amount,
    currency: "USD",
    dueDate,
    source: "pasted",
  });
  // Already submitted (a double click, or the back button): don't classify again, just show that reply.
  if (!created) redirect(`/try?result=${id}#result`);

  const detail = await getReplyDetail(id);
  // 12 s per attempt (not 15) so a timeout plus the one retry still finishes inside the page's 30 s limit.
  const result = await classify(replyToInput(detail!.reply), { provider: groqProvider({ timeoutMs: 12_000 }) });
  await saveClassification(id, result);

  revalidatePath("/");
  revalidatePath("/replies");
  redirect(`/try?result=${id}#result`);
}
