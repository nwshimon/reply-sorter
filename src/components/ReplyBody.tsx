import { splitQuoted } from "@/lib/body";

/** Text with the first occurrence of `quote` highlighted. */
function Marked({ text, quote }: { text: string; quote: string }) {
  const at = quote ? text.indexOf(quote) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded bg-yellow-200 px-0.5 text-neutral-900">{quote}</mark>
      {text.slice(at + quote.length)}
    </>
  );
}

/**
 * The reply as the customer wrote it, with the model's evidence quote highlighted. The quoted earlier email below
 * it (POLICY.md: only the customer's own words count) is shown muted.
 */
export function ReplyBody({ body, quote }: { body: string; quote: string | null }) {
  const { own, quoted } = splitQuoted(body);
  const q = (quote ?? "").trim();
  const found = q !== "" && body.includes(q);
  return (
    <div className="text-sm leading-relaxed">
      <p className="whitespace-pre-wrap break-words">
        <Marked text={own} quote={q} />
      </p>
      {quoted && (
        <p className="mt-3 whitespace-pre-wrap break-words border-l-2 border-neutral-300 pl-3 text-neutral-400">
          <Marked text={quoted} quote={q} />
        </p>
      )}
      {q !== "" && !found && <p className="mt-2 text-xs text-red-700">The model’s evidence quote isn’t in the reply, so nothing is highlighted.</p>}
    </div>
  );
}

/** Whether a body is long enough to need "Show more". */
export const isLongBody = (body: string) => body.length > 320 || body.split("\n").length > 6;
