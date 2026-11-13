// Promised-date checks for the promise-horizon rule (POLICY.md section 4, rules 6). Plain functions:
// no network, no database, no env. The model returns the date as YYYY-MM-DD; code only VALIDATES it
// (a real calendar date, not before the reply) and counts the days. It doesn't parse phrases: a date
// code can't validate is simply discarded, and a promise with no usable date stays automatic.
// All calendar math is in UTC, relative to the UTC date of received_at.

const DAY_MS = 86_400_000;

/** A UTC date as YYYY-MM-DD. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** A real calendar date in YYYY-MM-DD form (rejects "2026-02-30", "11/25", "2026-1-5"). */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && isoDate(d) === s;
}

export type DateCheck = { ok: true } | { ok: false; reason: "invalid_format" | "before_received" };

/** The model's promised_date must be a real date, not before the day the reply was received. */
export function checkPromisedDate(date: string, receivedAt: Date): DateCheck {
  if (!isValidIsoDate(date)) return { ok: false, reason: "invalid_format" };
  if (date < isoDate(receivedAt)) return { ok: false, reason: "before_received" };
  return { ok: true };
}

/**
 * Whole calendar days from the day the reply was received to the promised date (a valid YYYY-MM-DD).
 * Same day = 0, next day = 1. Calendar days, so the time of day on either side doesn't matter.
 */
export function daysUntil(promisedDate: string, receivedAt: Date): number {
  const received = Date.parse(`${isoDate(receivedAt)}T00:00:00Z`);
  const promised = Date.parse(`${promisedDate}T00:00:00Z`);
  return Math.round((promised - received) / DAY_MS);
}

/** POLICY.md section 4, rule 6: more than this many days after received_at is too far out for automatic follow-up. */
export const PROMISE_HORIZON_DAYS = 30;
