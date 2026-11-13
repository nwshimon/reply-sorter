import { describe, expect, it } from "vitest";
import { checkPromisedDate, daysUntil, isValidIsoDate, PROMISE_HORIZON_DAYS } from "../src/lib/dates";

// Friday 2026-11-13, 17:20 UTC (the received_at of reply #36).
const FRI = new Date("2026-11-13T17:20:00Z");

describe("isValidIsoDate", () => {
  it("accepts real calendar dates only", () => {
    expect(isValidIsoDate("2026-11-25")).toBe(true);
    expect(isValidIsoDate("2028-02-29")).toBe(true); // leap year
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
  });
  it("rejects anything that isn't YYYY-MM-DD", () => {
    for (const s of ["11/25", "Nov 20", "2026-1-5", "2026/11/25", "", "tomorrow", "2026-11-25T00:00:00Z"]) {
      expect(isValidIsoDate(s), s).toBe(false);
    }
  });
});

describe("checkPromisedDate", () => {
  it("accepts the day of the reply and later", () => {
    expect(checkPromisedDate("2026-11-13", FRI)).toEqual({ ok: true });
    expect(checkPromisedDate("2027-03-31", FRI)).toEqual({ ok: true });
  });
  it("rejects a date before the reply was received", () => {
    expect(checkPromisedDate("2026-11-12", FRI)).toEqual({ ok: false, reason: "before_received" });
  });
  it("rejects a malformed or impossible date", () => {
    expect(checkPromisedDate("Nov 20", FRI)).toEqual({ ok: false, reason: "invalid_format" });
    expect(checkPromisedDate("2026-02-30", FRI)).toEqual({ ok: false, reason: "invalid_format" });
  });
  it("compares calendar days, so late-evening UTC replies don't shift the day", () => {
    const lateUtc = new Date("2026-11-13T23:59:00Z");
    expect(checkPromisedDate("2026-11-13", lateUtc)).toEqual({ ok: true });
    expect(checkPromisedDate("2026-11-12", lateUtc)).toEqual({ ok: false, reason: "before_received" });
  });
});

describe("daysUntil: calendar days from received_at", () => {
  it("counts the dataset cases the policy names", () => {
    expect(daysUntil("2026-11-15", new Date("2026-11-07T18:48:00Z"))).toBe(8); // #12
    expect(daysUntil("2027-01-01", new Date("2026-11-14T15:10:00Z"))).toBe(48); // #38
    expect(daysUntil("2027-03-31", new Date("2026-11-17T18:00:00Z"))).toBe(134); // H09
  });
  it("same day is 0 and next day is 1, whatever the time of day", () => {
    expect(daysUntil("2026-11-13", FRI)).toBe(0);
    expect(daysUntil("2026-11-14", FRI)).toBe(1);
    expect(daysUntil("2026-11-14", new Date("2026-11-13T00:00:01Z"))).toBe(1);
    expect(daysUntil("2026-11-14", new Date("2026-11-13T23:59:59Z"))).toBe(1);
  });
  it("crosses month, year and leap-day boundaries", () => {
    expect(daysUntil("2026-12-01", new Date("2026-11-30T10:00:00Z"))).toBe(1);
    expect(daysUntil("2027-01-01", new Date("2026-12-31T10:00:00Z"))).toBe(1);
    expect(daysUntil("2028-03-01", new Date("2028-02-28T10:00:00Z"))).toBe(2); // 2028 is a leap year
    expect(daysUntil("2027-03-01", new Date("2027-02-28T10:00:00Z"))).toBe(1);
  });
  it("is unaffected by daylight-saving changes", () => {
    expect(daysUntil("2026-11-02", new Date("2026-10-31T12:00:00Z"))).toBe(2); // US clocks change on Nov 1
    expect(daysUntil("2026-03-10", new Date("2026-03-07T12:00:00Z"))).toBe(3); // and on Mar 8
  });
  it("the horizon boundary: exactly 30 days is not more than 30", () => {
    expect(PROMISE_HORIZON_DAYS).toBe(30);
    expect(daysUntil("2026-12-13", FRI)).toBe(30);
    expect(daysUntil("2026-12-14", FRI)).toBe(31);
  });
});
