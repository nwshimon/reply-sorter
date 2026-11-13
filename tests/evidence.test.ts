import { describe, expect, it } from "vitest";
import { amountInText, cents, quoteInBody, sameAmount, sameInvoiceNumber } from "../src/lib/evidence";

describe("cents", () => {
  it("converts numbers and numeric strings to whole cents", () => {
    expect(cents(3500)).toBe(350000);
    expect(cents("3500.00")).toBe(350000);
    expect(cents(615.5)).toBe(61550);
    expect(cents(0.1 + 0.2)).toBe(30); // float noise rounds away
  });
  it("sameAmount handles string vs number", () => {
    expect(sameAmount("3500.00", 3500)).toBe(true);
    expect(sameAmount("3500.00", 3150)).toBe(false);
    expect(sameAmount("abc", "abc")).toBe(false);
  });
});

describe("quoteInBody", () => {
  const body = "Paid this morning through your portal. Confirmation number 88231.";
  it("accepts an exact substring, ignoring the quote's outer whitespace", () => {
    expect(quoteInBody("Confirmation number 88231", body)).toBe(true);
    expect(quoteInBody("  Confirmation number 88231 ", body)).toBe(true);
  });
  it("rejects paraphrase, case changes and empty quotes", () => {
    expect(quoteInBody("confirmation number 88231", body)).toBe(false);
    expect(quoteInBody("Conf # 88231", body)).toBe(false);
    expect(quoteInBody("", body)).toBe(false);
    expect(quoteInBody(null, body)).toBe(false);
  });
});

describe("amountInText", () => {
  it("finds amounts in common US formats", () => {
    expect(amountInText(3150, "Wired $3,150 this morning.")).toBe(true);
    expect(amountInText(3150, "Wired 3150 USD.")).toBe(true);
    expect(amountInText(1000, "Paid $1,000 of the $3,400 today.")).toBe(true);
    expect(amountInText(3400, "Paid $1,000 of the $3,400 today.")).toBe(true);
    expect(amountInText(615.5, "Sent $615.50 just now.")).toBe(true);
  });
  it("finds amounts in European formats", () => {
    expect(amountInText(3150, "Wir haben 3.150,00 € überwiesen.")).toBe(true);
    expect(amountInText(1840.5, "Pagamos 1.840,50 hoy.")).toBe(true);
  });
  it("rejects amounts that aren't there", () => {
    expect(amountInText(3500, "Wired $3,150 this morning.")).toBe(false);
    expect(amountInText(1700, "We paid half today.")).toBe(false);
  });
});

describe("sameInvoiceNumber", () => {
  it("matches format variations of the same invoice", () => {
    expect(sameInvoiceNumber("INV-2310", "INV-2310")).toBe(true);
    expect(sameInvoiceNumber("inv 2310", "INV-2310")).toBe(true);
    expect(sameInvoiceNumber("2310", "INV-2310")).toBe(true);
    expect(sameInvoiceNumber("#2310", "INV-2310")).toBe(true);
  });
  it("rejects a different invoice", () => {
    expect(sameInvoiceNumber("INV-2307", "INV-2310")).toBe(false);
    expect(sameInvoiceNumber("2307", "INV-2310")).toBe(false);
  });
});
