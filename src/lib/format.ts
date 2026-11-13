export const money = (amount: number | string, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));

/** "Nov 9" (UTC, matching how received_at is stored). */
export const shortDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const dateTime = (d: Date) =>
  d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The prefilled due date in the paste box: five days ago, so the sample invoice is overdue. Evaluated per request. */
export const sampleDueDate = () => isoDay(new Date(Date.now() - 5 * 86_400_000));
