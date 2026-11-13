// Promised-date checks (POLICY.md section 2, rule 5). Plain functions: no network, no database, no env.
// All calendar math is in UTC, relative to the UTC date of received_at. A customer late in the day
// in a western time zone could mean a date one day off; the phrase is always stored as written.

const DAY_MS = 86_400_000;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A UTC date as YYYY-MM-DD. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
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
  if (date < isoDate(utcDay(receivedAt))) return { ok: false, reason: "before_received" };
  return { ok: true };
}

/** Month/day with no year: this year, or next year if that date has already passed. */
function nextMonthDay(month: number, day: number, today: Date): Date | null {
  for (const year of [today.getUTCFullYear(), today.getUTCFullYear() + 1]) {
    const d = new Date(Date.UTC(year, month, day));
    if (d.getUTCMonth() !== month) return null; // e.g. Feb 30
    if (d >= today) return d;
  }
  return null;
}

/** The next given weekday strictly after today (a Friday reply saying "Friday" means next Friday). */
function nextWeekday(target: number, today: Date): Date {
  const diff = (target - today.getUTCDay() + 7) % 7 || 7;
  return addDays(today, diff);
}

/** Friday of the week containing `d` (weeks run Monday to Sunday). */
function fridayOfWeek(d: Date): Date {
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  return addDays(addDays(d, -mondayOffset), 4);
}

/**
 * Turn a date phrase into one calendar date using received_at, or null if it isn't specific
 * ("soon", "next week") or isn't a form this resolver knows. Used to cross-check the model.
 */
export function resolveDatePhrase(phrase: string, receivedAt: Date): string | null {
  const today = utcDay(receivedAt);
  const p = phrase
    .toLowerCase()
    .replace(/[,.]/g, " ")
    .replace(/\b(by|on|before|until|no later than)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^today$|^end of (the )?day$/.test(p)) return isoDate(today);
  if (/^tomorrow$/.test(p)) return isoDate(addDays(today, 1));
  if (/^(the )?day after tomorrow$/.test(p)) return isoDate(addDays(today, 2));

  // "end of (this|the) week" → Friday this week; "end of next week" → Friday next week.
  if (/^end of (this |the )?week$/.test(p)) {
    const fri = fridayOfWeek(today);
    return isoDate(fri >= today ? fri : addDays(fri, 7));
  }
  if (/^end of next week$/.test(p)) return isoDate(addDays(fridayOfWeek(today), 7));

  // "end of (the|this) month" → last day of this month.
  if (/^end of (this |the )?month$/.test(p)) {
    return isoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)));
  }

  // Weekday: "friday", "this friday", "next friday" (next = the one after the coming one only if
  // the coming one is in this same week; otherwise the coming one).
  const wd = p.match(/^(this |next |coming )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[2]);
    let d = nextWeekday(target, today);
    if (wd[1] === "next " && fridayOfWeek(d).getTime() === fridayOfWeek(today).getTime()) d = addDays(d, 7);
    return isoDate(d);
  }

  // ISO: 2026-11-20
  const iso = p.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return isValidIsoDate(p) ? p : null;

  // US numeric: 11/25 or 11/25/2026 or 11/25/26
  const us = p.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (us) {
    const [month, day] = [Number(us[1]) - 1, Number(us[2])];
    if (us[3]) {
      const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
      const d = new Date(Date.UTC(year, month, day));
      return d.getUTCMonth() === month ? isoDate(d) : null;
    }
    const d = nextMonthDay(month, day, today);
    return d ? isoDate(d) : null;
  }

  // Month name + day: "nov 20", "november 20th", "20 november", "january 1 2027"
  const md =
    p.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/) ??
    p.match(/^(?:the )?(\d{1,2})(?:st|nd|rd|th)? (?:of )?([a-z]+)(?: (\d{4}))?$/);
  if (md) {
    const [name, dayStr] = /^\d/.test(md[1]) ? [md[2], md[1]] : [md[1], md[2]];
    const month = MONTHS.indexOf(name.slice(0, 3));
    if (month >= 0 && name.length >= 3) {
      const day = Number(dayStr);
      if (md[3]) {
        const d = new Date(Date.UTC(Number(md[3]), month, day));
        return d.getUTCMonth() === month ? isoDate(d) : null;
      }
      const d = nextMonthDay(month, day, today);
      return d ? isoDate(d) : null;
    }
  }

  // Day of month alone: "the 15th", "15th" → this month, or next month if already passed.
  const dom = p.match(/^(?:the )?(\d{1,2})(?:st|nd|rd|th)$/);
  if (dom) {
    const day = Number(dom[1]);
    for (const offset of [0, 1]) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, day));
      if (d.getUTCDate() === day && d >= today) return isoDate(d);
    }
    return null;
  }

  return null;
}
