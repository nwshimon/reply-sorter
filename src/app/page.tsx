import { listReplies, type ReplyListRow } from "@/db/queries";

// Reads live data from Postgres on every request (Cache Components is off; see next.config.ts).
export const dynamic = "force-dynamic";

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);

const day = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function RepliesPage() {
  const rows = await listReplies();
  const dataset = rows.filter((r) => r.reply.source === "dataset");
  const heldout = rows.filter((r) => r.reply.source === "heldout");
  const pasted = rows.filter((r) => r.reply.source === "pasted");
  const classified = rows.filter((r) => r.shownCategory !== null).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Replies</h1>
        <p className="text-sm text-neutral-500">
          {rows.length} replies · {classified} classified
        </p>
      </div>

      <Section title="Dataset" rows={dataset} />
      <Section
        title="Held-out set"
        hint="Never used to tune the prompt; scored separately."
        rows={heldout}
      />
      {pasted.length > 0 && <Section title="Pasted" rows={pasted} />}
    </main>
  );
}

function Section({ title, hint, rows }: { title: string; hint?: string; rows: ReplyListRow[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {title} <span className="text-neutral-400">({rows.length})</span>
      </h2>
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Reply</th>
              <th className="px-3 py-2 font-medium">Invoice</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Received</th>
              <th className="px-3 py-2 font-medium">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {rows.map(({ reply, shownCategory }) => (
              <tr key={reply.id} className="align-top hover:bg-neutral-50 dark:hover:bg-neutral-900/60">
                <td className="px-3 py-2 font-mono text-xs text-neutral-500">{reply.id}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{reply.customer}</div>
                  <div className="text-xs text-neutral-500">{reply.sender}</div>
                </td>
                <td className="max-w-md px-3 py-2">
                  <p className="line-clamp-2 text-neutral-700 dark:text-neutral-300">{reply.body}</p>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{reply.invoiceNumber}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {money(reply.invoiceAmount, reply.currency)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-neutral-500">{day(reply.receivedAt)}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {shownCategory ?? <span className="text-xs text-neutral-400">Not classified yet</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
