import { describe, expect, it } from "vitest";
import { checkPromisedDate, isValidIsoDate, resolveDatePhrase } from "../src/lib/dates";

// Friday 2026-11-13, 17:20 UTC (same received_at as reply #36).
const FRI = new Date("2026-11-13T17:20:00Z");
const r = (phrase: string, at = FRI) => resolveDatePhrase(phrase, at);

describe("isValidIsoDate / checkPromisedDate", () => {
  it("accepts real dates only", () => {
    expect(isValidIsoDate("2026-11-25")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("11/25")).toBe(false);
    expect(isValidIsoDate("2026-1-5")).toBe(false);
  });
  it("rejects dates before the reply was received; the same day is fine", () => {
    expect(checkPromisedDate("2026-11-13", FRI)).toEqual({ ok: true });
    expect(checkPromisedDate("2026-11-12", FRI)).toEqual({ ok: false, reason: "before_received" });
    expect(checkPromisedDate("Nov 20", FRI)).toEqual({ ok: false, reason: "invalid_format" });
  });
});

describe("resolveDatePhrase (POLICY.md rule 2.5 examples)", () => {
  it("relative days", () => {
    expect(r("today")).toBe("2026-11-13");
    expect(r("tomorrow")).toBe("2026-11-14");
    expect(r("by tomorrow")).toBe("2026-11-14");
  });
  it("day of month rolls to next month once passed", () => {
    expect(r("the 15th")).toBe("2026-11-15");
    expect(r("the 1st")).toBe("2026-12-01");
  });
  it("end of week / next week / month (weeks Monday–Sunday, 'end' = Friday)", () => {
    expect(r("end of the week")).toBe("2026-11-13");
    expect(r("end of next week")).toBe("2026-11-20");
    expect(r("end of the month")).toBe("2026-11-30");
  });
  it("weekdays mean the next one after the reply day", () => {
    expect(r("Friday")).toBe("2026-11-20");
    expect(r("Monday")).toBe("2026-11-16");
    expect(r("next Monday")).toBe("2026-11-16"); // reply is on a Friday: the coming Monday is next week
    expect(r("next Wednesday", new Date("2026-11-16T12:00:00Z"))).toBe("2026-11-25"); // from a Monday
  });
  it("numeric and month-name dates roll to next year once passed", () => {
    expect(r("11/25")).toBe("2026-11-25");
    expect(r("1/5")).toBe("2027-01-05");
    expect(r("January 1")).toBe("2027-01-01");
    expect(r("Nov 20")).toBe("2026-11-20");
    expect(r("November 20th")).toBe("2026-11-20");
    expect(r("20 November")).toBe("2026-11-20");
    expect(r("2026-12-01")).toBe("2026-12-01");
  });
  it("returns null for phrases that aren't one date", () => {
    expect(r("soon")).toBeNull();
    expect(r("next week")).toBeNull();
    expect(r("after the holidays")).toBeNull();
    expect(r("February 30")).toBeNull();
  });
});
