"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that locks while its form's Server Action is running, so a double click (or an
 * impatient third click) can't send the same reply twice. Sorting takes a few seconds, so the label
 * changes too. The server also ignores a repeated submission (see sortPastedReply), so this is the
 * first guard, not the only one.
 */
export function SubmitButton({ children, pendingText, className }: { children: React.ReactNode; pendingText: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`}>
      {pending ? pendingText : children}
    </button>
  );
}
