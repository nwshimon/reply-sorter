"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

function format(iso: string, mode: "date" | "datetime", timeZone: string | undefined): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions =
    mode === "date"
      ? { month: "short", day: "numeric", year: "numeric", timeZone }
      : { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone };
  return d.toLocaleString("en-US", opts);
}

/**
 * A moment shown in the VIEWER's local time ("Nov 15, 2026" or "Nov 15, 2026, 2:10 PM"). The server can't know the
 * viewer's time zone, so it renders UTC and the browser swaps in local time without a hydration mismatch.
 */
export function LocalTime({ iso, mode = "date" }: { iso: string; mode?: "date" | "datetime" }) {
  const text = useSyncExternalStore(
    subscribe,
    () => format(iso, mode, undefined),
    () => format(iso, mode, "UTC"),
  );
  return <time dateTime={iso}>{text}</time>;
}
