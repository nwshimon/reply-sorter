import Link from "next/link";
import { STATUS_LABELS, type ReplyListRow } from "@/db/queries";
import type { ModelDetails } from "@/lib/classifier/schema";
import { money } from "@/lib/format";
import { keyDetail } from "@/lib/key-detail";
import { reasonChips } from "@/lib/reasons";
import { CategoryPill } from "./CategoryPill";
import { LocalTime } from "./LocalTime";

/** Every reply: customer, invoice, received, a one-line preview, category, status and the key detail. */
export function ReplyTable({ rows }: { rows: ReplyListRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-3 py-2 font-medium">Customer</th>
            <th className="hidden px-3 py-2 font-medium sm:table-cell">Invoice</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">Received</th>
            <th className="hidden px-3 py-2 font-medium lg:table-cell">Reply</th>
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="hidden px-3 py-2 font-medium sm:table-cell">Status</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">Key detail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((r) => {
            const { reply } = r;
            const chips = reasonChips({ overrideReasons: r.overrideReasons ?? [], reviewReasons: r.reviewReasons ?? [], latestAction: r.correctionAction, shown: r.shownCategory });
            const detail = keyDetail(r.shownCategory, (r.details ?? null) as ModelDetails | null, reply.currency, chips[0] ?? null);
            const href = `/replies/${reply.id}`;
            return (
              <tr key={reply.id} className="align-top hover:bg-neutral-50">
                <td className="px-3 py-2.5">
                  <Link href={href} className="font-medium hover:underline">
                    {reply.customer}
                  </Link>
                  <div className="font-mono text-xs text-neutral-500">#{reply.id}</div>
                  {/* On a phone the other columns are hidden, so the essentials go under the name. */}
                  <p className="mt-1 max-w-[9.5rem] truncate text-xs text-neutral-600 lg:hidden">{reply.body}</p>
                  <p className="mt-0.5 text-xs text-neutral-500 sm:hidden">
                    {r.status ? STATUS_LABELS[r.status] : ""} · {money(reply.invoiceAmount, reply.currency)}
                  </p>
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 sm:table-cell">
                  <div className="tabular-nums">{money(reply.invoiceAmount, reply.currency)}</div>
                  <div className="font-mono text-xs text-neutral-500">{reply.invoiceNumber}</div>
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 text-neutral-600 md:table-cell">
                  <LocalTime iso={reply.receivedAt.toISOString()} />
                </td>
                <td className="hidden max-w-xs px-3 py-2.5 lg:table-cell">
                  <Link href={href} className="line-clamp-1 text-neutral-700 hover:underline">
                    {reply.body}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <CategoryPill category={r.shownCategory} />
                </td>
                <td className={`hidden whitespace-nowrap px-3 py-2.5 sm:table-cell ${r.status === "in_review" ? "font-medium text-ink" : "text-neutral-600"}`}>
                  {r.status ? STATUS_LABELS[r.status] : "—"}
                </td>
                <td className="hidden px-3 py-2.5 text-xs text-neutral-700 md:table-cell">
                  {detail ? (
                    <>
                      <div>{detail.primary}</div>
                      {detail.muted && <div className="text-neutral-400">{detail.muted}</div>}
                    </>
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
