import { sortPastedReply } from "@/app/actions";
import { sampleDueDate } from "@/lib/format";

const input =
  "mt-1 w-full rounded-md border border-neutral-300 bg-transparent px-2.5 py-1.5 text-sm dark:border-neutral-700";

/** Paste a reply, see how it's sorted. Runs the same classify() as the batch script. */
export function TryForm({ error }: { error?: string }) {
  const due = sampleDueDate();
  return (
    <form action={sortPastedReply} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-medium">Try a reply</h2>
      <p className="text-xs text-neutral-500">Paste any customer reply to see how it’s sorted. It’s checked against the sample invoice below; change it to test the rules.</p>

      <textarea
        name="body"
        required
        rows={4}
        maxLength={6000}
        placeholder="e.g. Wired $3,150 this morning, trace 0210…"
        className={`${input} mt-3 resize-y leading-relaxed`}
      />

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="text-xs text-neutral-500">
          Invoice number
          <input name="invoiceNumber" defaultValue="INV-1001" required className={input} />
        </label>
        <label className="text-xs text-neutral-500">
          Invoice amount (USD)
          <input name="invoiceAmount" defaultValue="3500.00" inputMode="decimal" required className={input} />
        </label>
        <label className="text-xs text-neutral-500">
          Due date
          <input name="dueDate" type="date" defaultValue={due} required className={input} />
        </label>
        <div className="flex items-end">
          <button className="w-full rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300">
            Sort it
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
