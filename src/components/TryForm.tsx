"use client";

import { useEffect, useRef, useState } from "react";
import { sortPastedReply } from "@/app/actions";
import type { TryExample } from "@/lib/examples";
import { SubmitButton } from "./SubmitButton";

const input = "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

/** "2026-11-15T09:30" for a datetime-local box, in the browser's own time zone. */
const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/**
 * Paste a reply and see how it's sorted. The invoice fields are required (the paid recheck needs them) and prefilled
 * with an editable sample. Example buttons fill the box with tricky replies. A one-time submissionId makes a repeated
 * submission harmless.
 */
export function TryForm({ examples, submissionId, defaultDue, error }: { examples: TryExample[]; submissionId: string; defaultDue: string; error?: string }) {
  const [body, setBody] = useState("");
  const receivedRef = useRef<HTMLInputElement>(null);
  const tzRef = useRef<HTMLInputElement>(null);

  // Default "received at" to now, and send the browser's UTC offset so the server reads the time correctly.
  // (Set on the DOM, not in state: the server can't know the viewer's clock.)
  useEffect(() => {
    if (receivedRef.current && !receivedRef.current.value) receivedRef.current.value = localNow();
    if (tzRef.current) tzRef.current.value = String(new Date().getTimezoneOffset());
  }, []);

  return (
    <form action={sortPastedReply} className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="tzOffset" ref={tzRef} defaultValue="0" />

      <div>
        <p className="text-xs uppercase tracking-wide text-neutral-500">Try an example</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {examples.map((e) => (
            <button
              key={e.label}
              type="button"
              onClick={() => setBody(e.body)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-tan"
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block text-sm font-medium">
        Customer reply
        <textarea
          name="body"
          required
          rows={6}
          maxLength={6000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Paste a customer reply here…"
          className={`${input} resize-y font-normal leading-relaxed`}
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-xs text-neutral-500">
          Sender (optional)
          <input name="sender" placeholder="Pasted reply" className={input} />
        </label>
        <label className="text-xs text-neutral-500">
          Subject (optional)
          <input name="subject" placeholder="Pasted reply" className={input} />
        </label>
        <label className="text-xs text-neutral-500">
          Received at
          <input name="receivedAt" type="datetime-local" ref={receivedRef} className={input} />
        </label>
      </div>

      <fieldset className="rounded-lg bg-neutral-50 p-3">
        <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">Sample invoice</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs text-neutral-500">
            Invoice number
            <input name="invoiceNumber" defaultValue="INV-9001" required className={input} />
          </label>
          <label className="text-xs text-neutral-500">
            Amount (USD)
            <input name="invoiceAmount" defaultValue="1840.00" inputMode="decimal" required className={input} />
          </label>
          <label className="text-xs text-neutral-500">
            Due date
            <input name="dueDate" type="date" defaultValue={defaultDue} required className={input} />
          </label>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Edit the invoice to test amount and invoice-number checks.</p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Sorting… this can take up to 20 seconds." className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink shadow-sm transition hover:brightness-95">
          Sort this reply
        </SubmitButton>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
