"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getReplyDetail, insertPastedReply, replyToInput, saveClassification, saveCorrection } from "@/db/queries";
import { isCategory } from "@/lib/categories";
import { classify, MAX_BODY_CHARS } from "@/lib/classifier/classify";
import { llmProvider } from "@/lib/classifier/providers";
import { isValidIsoDate } from "@/lib/dates";

/**
 * A person corrects a category: one click, plus an optional note. A correction changes the category
 * the app shows. It never changes the stored model result and never counts in the evaluation.
 */
export async function correctCategory(formData: FormData) {
  const replyId = String(formData.get("replyId") ?? "");
  const to = formData.get("to");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  if (!isCategory(to)) return;

  const detail = await getReplyDetail(replyId);
  if (!detail || detail.shownCategory === to) return;

  await saveCorrection({ replyId, fromCategory: detail.shownCategory, toCategory: to, note });
  revalidatePath("/", "layout");
}

/**
 * Sort a pasted reply: store it (source = pasted), run the same classify() as the batch script,
 * store the result (or the failure), then show it on the Review page. Invoice fields stay
 * required: the paid recheck needs them. The form prefills a sample invoice.
 */
export async function sortPastedReply(formData: FormData) {
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const body = field("body");
  const invoiceNumber = field("invoiceNumber");
  const amount = Number(field("invoiceAmount").replace(/[$,]/g, ""));
  const dueDate = field("dueDate");

  const fail = (message: string): never => redirect(`/?error=${encodeURIComponent(message)}`);
  if (!body) fail("Paste a reply first.");
  if (body.length > MAX_BODY_CHARS) fail(`That reply is ${body.length} characters; the limit is ${MAX_BODY_CHARS}.`);
  if (!invoiceNumber) fail("Enter an invoice number.");
  if (!Number.isFinite(amount) || amount <= 0) fail("Enter an invoice amount greater than 0.");
  if (!isValidIsoDate(dueDate)) fail("Enter a valid due date.");

  // The form carries a one-time id, so a repeated submission of the same form maps to the same reply.
  // Without a valid one (e.g. a form posted without it) a fresh id is generated.
  const sent = field("submissionId");
  const id = `P-${/^[0-9a-f]{6}$/.test(sent) ? sent : randomBytes(3).toString("hex")}`;
  const created = await insertPastedReply({
    id,
    sender: field("sender") || "Pasted reply",
    customer: "Pasted reply",
    subject: field("subject") || "Pasted reply",
    body,
    receivedAt: new Date(),
    invoiceNumber,
    invoiceAmount: amount,
    currency: "USD",
    dueDate,
    source: "pasted",
  });
  // Already submitted (a double click, or the back button): don't classify again, just show that reply.
  if (!created) redirect(`/?pasted=${id}#result`);

  const detail = await getReplyDetail(id);
  // 12 s per attempt (not 15) so a timeout plus the one retry still finishes inside the page's 30 s limit.
  const result = await classify(replyToInput(detail!.reply), { provider: llmProvider({ timeoutMs: 12_000 }) });
  await saveClassification(id, result);

  revalidatePath("/replies");
  redirect(`/?pasted=${id}#result`);
}
