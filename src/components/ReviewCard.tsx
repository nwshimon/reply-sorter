import Link from "next/link";
import type { QueueSection, ReplyListRow } from "@/db/queries";
import { reasonChips } from "@/lib/reasons";
import { calendarDate, money } from "@/lib/format";
import { CategoryPill } from "./CategoryPill";
import { ClampedText } from "./ClampedText";
import { LocalTime } from "./LocalTime";
import { ReasonChips } from "./ReasonChips";
import { isLongBody, ReplyBody } from "./ReplyBody";
import { ReviewActions } from "./ReviewActions";

/** One reply waiting in the review queue, with the action for its section. */
export function ReviewCard({ row, section }: { row: ReplyListRow; section: QueueSection }) {
  const { reply } = row;
  const shown = row.shownCategory!;
  const chips = reasonChips({ overrideReasons: row.overrideReasons ?? [], reviewReasons: row.reviewReasons ?? [], latestAction: row.correctionAction, shown });

  return (
    <li className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={`/replies/${reply.id}`} className="text-sm font-semibold hover:underline">
          {reply.customer}
        </Link>
        <span className="font-mono text-xs text-neutral-500">#{reply.id}</span>
        <CategoryPill category={shown} />
      </div>
      <p className="text-xs text-neutral-500">
        {reply.invoiceNumber} · {money(reply.invoiceAmount, reply.currency)} · due {calendarDate(reply.dueDate)} · received <LocalTime iso={reply.receivedAt.toISOString()} />
      </p>

      <div className="rounded-lg bg-neutral-50 p-3">
        <ClampedText long={isLongBody(reply.body)}>
          <ReplyBody body={reply.body} quote={row.evidenceQuote ?? null} />
        </ClampedText>
      </div>

      <ReasonChips chips={chips} />

      <ReviewActions replyId={reply.id} section={section} shown={shown} returnTo="/review" />

      <Link href={`/replies/${reply.id}`} className="inline-block text-xs font-medium text-neutral-600 underline underline-offset-2 hover:text-ink">
        Open details
      </Link>
    </li>
  );
}
