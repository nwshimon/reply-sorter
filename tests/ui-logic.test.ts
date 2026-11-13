import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextStepText, queueSection, replyStatus, type LatestAction } from "../src/db/queries";
import { CATEGORIES, CATEGORY_LABELS, CATEGORY_STYLES, isAutomatic, type Category } from "../src/lib/categories";
import { splitQuoted } from "../src/lib/body";
import type { ModelDetails } from "../src/lib/classifier/schema";
import { classifierFailure } from "../src/lib/errors";
import { TRY_EXAMPLES } from "../src/lib/examples";
import { keyDetail } from "../src/lib/key-detail";
import { OVERRIDE_REASONS, REVIEW_REASONS } from "../src/lib/policy";
import { reasonChips, REASONS, reasonText, ruleSentence } from "../src/lib/reasons";

const act = (action: LatestAction extends infer T ? (T extends { action: infer A } ? A : never) : never, toCategory: Category): LatestAction => ({ action, toCategory });

describe("categories: labels and colours are defined once and complete", () => {
  it("has a label and a colour for all six, and the labels the interface spec names", () => {
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([...CATEGORIES].sort());
    expect(Object.keys(CATEGORY_STYLES).sort()).toEqual([...CATEGORIES].sort());
    expect(CATEGORY_LABELS).toMatchObject({ paid: "Paid", promise_to_pay: "Promise to pay", resend_invoice: "Resend invoice", dispute: "Dispute", out_of_office: "Out of office", needs_human: "Needs human" });
  });
  it("each category has its own colour", () => {
    expect(CATEGORY_STYLES.paid).toContain("green");
    expect(CATEGORY_STYLES.promise_to_pay).toContain("blue");
    expect(CATEGORY_STYLES.resend_invoice).toContain("teal");
    expect(CATEGORY_STYLES.dispute).toContain("red");
    expect(CATEGORY_STYLES.out_of_office).toContain("neutral");
    expect(CATEGORY_STYLES.needs_human).toContain("orange");
    expect(new Set(Object.values(CATEGORY_STYLES)).size).toBe(6);
  });
});

describe("replyStatus: Automatic, In review, Resolved", () => {
  it("a reply with no result has no status", () => expect(replyStatus(null, null)).toBeNull());

  it("with no action yet: automatic categories are Automatic, the rest are In review", () => {
    for (const c of CATEGORIES) expect(replyStatus(c, null), c).toBe(isAutomatic(c) ? "automatic" : "in_review");
  });

  it("✓ Payment confirmed → Resolved; ✗ Not found → In review (back in Needs human)", () => {
    expect(replyStatus("paid", act("confirm_paid", "paid"))).toBe("resolved");
    expect(replyStatus("needs_human", act("reject_paid", "needs_human"))).toBe("in_review");
  });
  it("Resolved offline → Resolved (the category stays dispute)", () => expect(replyStatus("dispute", act("resolve_offline", "dispute"))).toBe("resolved"));
  it("Keep as needs human → Resolved", () => expect(replyStatus("needs_human", act("keep", "needs_human"))).toBe("resolved"));

  it("recategorize: to an automatic category leaves the queue (Automatic)", () => {
    for (const c of ["promise_to_pay", "resend_invoice", "out_of_office"] as const) expect(replyStatus(c, act("recategorize", c)), c).toBe("automatic");
  });
  it("recategorize: to Paid counts as confirmed (Resolved)", () => expect(replyStatus("paid", act("recategorize", "paid"))).toBe("resolved"));
  it("recategorize: to Dispute or Needs human puts it In review", () => {
    expect(replyStatus("dispute", act("recategorize", "dispute"))).toBe("in_review");
    expect(replyStatus("needs_human", act("recategorize", "needs_human"))).toBe("in_review");
  });
  it("only the LATEST action counts: a resolved dispute moved back to Needs human is open again", () => {
    expect(replyStatus("needs_human", act("recategorize", "needs_human"))).toBe("in_review");
  });
});

describe("queue sections and 'what happens next'", () => {
  it("maps the three queue categories to the three sections, and nothing else", () => {
    expect(queueSection("needs_human")).toBe("needs_human");
    expect(queueSection("paid")).toBe("confirm_payment");
    expect(queueSection("dispute")).toBe("dispute");
    for (const c of ["promise_to_pay", "resend_invoice", "out_of_office"] as const) expect(queueSection(c)).toBeNull();
  });
  it("says in plain words what happens next", () => {
    expect(nextStepText("promise_to_pay", "automatic")).toMatch(/automatically/);
    expect(nextStepText("paid", "in_review")).toMatch(/confirm payment/);
    expect(nextStepText("needs_human", "in_review")).toMatch(/set the right category/);
    expect(nextStepText("dispute", "in_review")).toMatch(/settle offline/);
    expect(nextStepText("paid", "resolved")).toMatch(/Resolved/);
    expect(nextStepText(null, null)).toMatch(/Not classified/);
  });
});

describe("reasons: one map, every policy code covered", () => {
  it("has an entry for every override reason and every review reason the policy can produce", () => {
    for (const code of [...Object.keys(OVERRIDE_REASONS), ...Object.keys(REVIEW_REASONS)]) expect(REASONS[code], `no readable text for "${code}"`).toBeDefined();
  });
  it("uses the wording the spec names", () => {
    expect(reasonText("low_confidence")).toBe("Low confidence");
    expect(reasonText("promise_over_30_days")).toBe("Promise more than 30 days out");
    expect(reasonText("other_invoice_mentioned")).toBe("Invoice number differs");
    expect(reasonText("paid_amount_mismatch")).toBe("Amount differs from invoice");
    expect(reasonText("paid_no_reference")).toBe("No payment reference");
    expect(reasonText("evidence_not_found")).toBe("Evidence not found in reply");
    expect(reasonText("manipulation_language")).toBe("Possible manipulation attempt");
    expect(reasonText("classifier_error")).toBe("Classifier error");
  });
  it("shows an unknown code as it is", () => expect(reasonText("some_future_code")).toBe("some_future_code"));

  it("chips: rules first, then flags, each text once; category-only codes are not chips", () => {
    const chips = reasonChips({ overrideReasons: ["paid_other_invoice", "low_confidence_demotion"], reviewReasons: ["needs_human", "rule_override", "other_invoice_mentioned", "low_confidence"], shown: "needs_human" });
    expect(chips).toEqual(["Invoice number differs", "Low confidence"]);
  });
  it("chips: 'Payment not found' comes first after ✗, and an unknown code is kept", () => {
    expect(reasonChips({ overrideReasons: [], reviewReasons: ["weird_code"], latestAction: "reject_paid", shown: "needs_human" })).toEqual(["Payment not found", "weird_code"]);
  });
  it("chips: a needs-human reply with nothing specific still gets one chip; other categories get none", () => {
    expect(reasonChips({ overrideReasons: [], reviewReasons: ["needs_human"], shown: "needs_human" })).toEqual(["Needs a person’s judgment"]);
    expect(reasonChips({ overrideReasons: [], reviewReasons: ["confirm_payment"], shown: "paid" })).toEqual([]);
  });

  it("rule sentences never mention a rank, and name the move in plain words", () => {
    expect(ruleSentence("promise_over_30_days", "promise_to_pay", "needs_human")).toBe("Promise more than 30 days out: moved to Needs human.");
    expect(ruleSentence("paid_amount_mismatch", "paid", "needs_human")).toBe("Model said Paid; the amount differs from the invoice: moved to Needs human.");
    for (const code of Object.keys(OVERRIDE_REASONS)) expect(ruleSentence(code, "paid", "needs_human"), code).not.toMatch(/\brank\b/i);
  });
});

describe("splitQuoted: only the customer's own words count", () => {
  it("leaves a plain reply alone", () => expect(splitQuoted("Paid this morning. Reference 88231.")).toEqual({ own: "Paid this morning. Reference 88231.", quoted: "" }));
  it("splits a flattened quote (dataset #21's shape)", () => {
    const body = "Payment made, thanks! > On Mon, Nov 9, 2026, JoyWork Billing <billing@joywork.example> wrote: > Hi, a friendly reminder.";
    const r = splitQuoted(body);
    expect(r.own).toBe("Payment made, thanks!");
    expect(r.quoted.startsWith("> On Mon")).toBe(true);
  });
  it("splits at '>' lines and 'On … wrote:' lines", () => {
    expect(splitQuoted("Will pay Friday.\n\n> Your invoice is due").own).toBe("Will pay Friday.");
    expect(splitQuoted("Thanks!\nOn Nov 9, 2026, Billing wrote:\nHi there").own).toBe("Thanks!");
  });
  it("does NOT treat a forwarded remittance advice as quoted (it counts as evidence)", () => {
    const body = "See remittance below.\n\n---------- Forwarded message ----------\nRemittance Advice\nInvoice INV-2246 Amount paid: $3,125.00";
    expect(splitQuoted(body)).toEqual({ own: body, quoted: "" });
  });
  it("never loses text: own + quoted always cover the whole reply, on every real reply", () => {
    const all = [...JSON.parse(readFileSync("data/replies.json", "utf8")), ...JSON.parse(readFileSync("data/heldout-replies.json", "utf8"))] as { body: string }[];
    for (const { body } of all) {
      const { own, quoted } = splitQuoted(body);
      expect((own + " " + quoted).replace(/\s+/g, " ").trim()).toBe(body.replace(/\s+/g, " ").trim());
    }
  });
});

describe("keyDetail by category", () => {
  const d = (o: Partial<ModelDetails>): ModelDetails => ({ amount_paid: null, amount_disputed: null, promised_date_text: null, promised_date: null, payment_reference: null, invoice_number_mentioned: null, ...o });
  it("paid: reference, plus the amount if given", () => {
    expect(keyDetail("paid", d({ payment_reference: "88231" }), "USD", null)).toEqual({ primary: "Ref 88231" });
    expect(keyDetail("paid", d({ payment_reference: "7731", amount_paid: 1840 }), "USD", null)).toEqual({ primary: "Ref 7731 · $1,840.00" });
  });
  it("promise_to_pay: the date as a date, and the phrase as written in muted text", () => {
    expect(keyDetail("promise_to_pay", d({ promised_date: "2026-11-15", promised_date_text: "the 15th" }), "USD", null)).toEqual({ primary: "Nov 15, 2026", muted: "“the 15th”" });
    expect(keyDetail("promise_to_pay", d({}), "USD", null)).toEqual({ primary: "No date given", muted: undefined });
  });
  it("dispute: the disputed amount if given", () => {
    expect(keyDetail("dispute", d({ amount_disputed: 400 }), "USD", null)).toEqual({ primary: "$400.00 disputed" });
    expect(keyDetail("dispute", d({}), "USD", null)).toBeNull();
  });
  it("needs_human: the first reason chip", () => expect(keyDetail("needs_human", null, "USD", "Low confidence")).toEqual({ primary: "Low confidence" }));
  it("others: nothing", () => {
    for (const c of ["resend_invoice", "out_of_office", null] as const) expect(keyDetail(c, d({ amount_paid: 5 }), "USD", "x")).toBeNull();
  });
});

describe("classifierFailure wording", () => {
  it("names the cause in plain words", () => {
    expect(classifierFailure("rate_limit: rate limited (HTTP 429)")).toBe("rate limit");
    expect(classifierFailure("timeout: no answer within 15s")).toBe("timeout");
    expect(classifierFailure("invalid_output: category: Invalid option")).toBe("unusable answer");
    expect(classifierFailure("something odd")).toBe("error");
  });
});

describe("Try a reply examples", () => {
  const all = [...JSON.parse(readFileSync("data/replies.json", "utf8")), ...JSON.parse(readFileSync("data/heldout-replies.json", "utf8"))] as { body: string }[];
  it("covers the four tricky cases the spec lists", () => {
    expect(TRY_EXAMPLES.map((e) => e.label)).toEqual(["Partial payment", "Injection attempt", "Far-off promise", "Out of office (French)"]);
  });
  it("uses none of the 52 test replies", () => {
    for (const e of TRY_EXAMPLES) for (const r of all) expect(r.body.trim(), e.label).not.toBe(e.body.trim());
  });
});
