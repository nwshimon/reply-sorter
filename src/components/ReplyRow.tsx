import Link from "next/link";
import type { ReplyListRow } from "@/db/queries";
import type { ModelDetails } from "@/lib/classifier/schema";
import { money, shortDate } from "@/lib/format";
import { describeConcerns } from "@/lib/review";
import { CategoryPill } from "./CategoryPill";
import { ConcernsLine } from "./Concerns";

/** "Paid $3,125 · Disputed $400 · Promised 2026-11-20", or nothing. */
export function detailsText(d: ModelDetails | null, currency: string): string {
  if (!d) return "";
  const parts: string[] = [];
  if (d.amount_paid != null) parts.push(`Paid ${money(d.amount_paid, currency)}`);
  if (d.amount_disputed != null) parts.push(`Disputed ${money(d.amount_disputed, currency)}`);
  if (d.promised_date) parts.push(`Promised ${d.promised_date}`);
  return parts.join(" · ");
}

/**
 * One reply, as in the sketch: "#id Customer", the message, then (on Review) plain-text concerns and an
 * expandable note. Used by both Review (a card per reply) and All replies (a row, shaded when it needs
 * review). The category is the only coloured thing on it.
 */
export function ReplyRow({ row, variant }: { row: ReplyListRow; variant: "review" | "list" }) {
  const { reply } = row;
  const d = (row.details ?? null) as ModelDetails | null;
  const details = detailsText(d, reply.currency);
  const href = `/replies/${reply.id}`;
  const concerns = describeConcerns({
    reviewReasons: row.reviewReasons ?? [],
    overrideReasons: row.overrideReasons ?? [],
    reasoning: row.reasoning ?? null,
    finalCategory: row.finalCategory ?? null,
  });

  const shell =
    variant === "review"
      ? "rounded-xl border border-neutral-200 bg-white px-4 py-3"
      : `border-l-4 px-4 py-3 ${row.needsReview ? "border-l-flag bg-flag-wash" : "border-l-transparent bg-white"}`;

  return (
    <li className={shell}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={href} className="text-sm font-medium hover:underline">
          <span className="mr-1.5 font-mono text-xs font-normal text-neutral-500">#{reply.id}</span>
          {reply.customer}
        </Link>
        <CategoryPill category={row.shownCategory} edited={!!row.correctedTo} />
        <span className="ml-auto whitespace-nowrap text-xs text-neutral-500">
          {reply.invoiceNumber} · {money(reply.invoiceAmount, reply.currency)} · {shortDate(reply.receivedAt)}
        </span>
      </div>

      <p className="mt-1.5 line-clamp-2 text-sm text-neutral-700">{reply.body}</p>

      {variant === "list" && details && <p className="mt-1 text-xs text-neutral-500">{details}</p>}

      {variant === "review" && (
        <>
          <div className="mt-2">
            <ConcernsLine concerns={concerns} />
          </div>
          <details className="group mt-1">
            <summary className="cursor-pointer list-none text-right text-[11px] font-medium uppercase tracking-wide text-neutral-500 hover:text-ink [&::-webkit-details-marker]:hidden">
              Expand note <span className="inline-block transition group-open:rotate-180">▾</span>
            </summary>
            <div className="mt-2 space-y-2 rounded-lg bg-neutral-50 p-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500">Model’s reasoning</p>
                <p className="mt-0.5 leading-relaxed">{row.reasoning ?? "No reasoning stored."}</p>
              </div>
              {details && <p className="text-xs text-neutral-500">{details}</p>}
              <Link href={href} className="inline-block text-xs font-medium underline underline-offset-2 hover:text-ink">
                Open reply to correct it →
              </Link>
            </div>
          </details>
        </>
      )}
    </li>
  );
}
