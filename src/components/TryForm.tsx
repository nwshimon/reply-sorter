import { randomBytes } from "node:crypto";
import { sortPastedReply } from "@/app/actions";
import { SubmitButton } from "./SubmitButton";
import { sampleDueDate } from "@/lib/format";

const input =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

/** "Try yourself": paste a reply, see how it's sorted. Runs the same classify() as the batch script. */
export function TryForm({ error }: { error?: string }) {
  const due = sampleDueDate();
  // One id per rendered form. The server uses it as the reply id, so submitting the same form twice
  // (double click, back button, a retry) can only ever create one reply.
  const submissionId = randomBytes(3).toString("hex");
  return (
    <form action={sortPastedReply} className="rounded-xl border border-neutral-200 bg-white p-4">
      <input type="hidden" name="submissionId" value={submissionId} />
      <h2 className="text-sm font-semibold">Try yourself</h2>
      <p className="mt-0.5 text-xs text-neutral-500">Paste a customer reply to see how it’s sorted.</p>

      <textarea
        name="body"
        required
        rows={4}
        maxLength={6000}
        placeholder="e.g. Wired $3,150 this morning, trace 0210…"
        className={`${input} mt-3 resize-y leading-relaxed`}
      />

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        {/* The invoice fields stay required (the paid recheck needs them). They're collapsed, but still submitted. */}
        <details className="group min-w-0 flex-1 text-xs text-neutral-500">
          <summary className="cursor-pointer list-none hover:text-ink [&::-webkit-details-marker]:hidden">
            Checked against a sample invoice: INV-1001 · $3,500.00{" "}
            <span className="underline underline-offset-2">edit</span>
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label>
              Invoice number
              <input name="invoiceNumber" defaultValue="INV-1001" required className={input} />
            </label>
            <label>
              Invoice amount (USD)
              <input name="invoiceAmount" defaultValue="3500.00" inputMode="decimal" required className={input} />
            </label>
            <label>
              Due date
              <input name="dueDate" type="date" defaultValue={due} required className={input} />
            </label>
          </div>
        </details>
        <SubmitButton
          pendingText="Sorting…"
          className="rounded-lg bg-accent px-5 py-2 text-xs font-semibold uppercase tracking-wide text-ink shadow-sm transition hover:brightness-95"
        >
          Submit
        </SubmitButton>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
