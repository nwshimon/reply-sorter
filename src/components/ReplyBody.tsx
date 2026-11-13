import { splitQuoted } from "@/lib/body";

/**
 * The reply as the customer wrote it. The quoted earlier email below it (POLICY.md: only the customer's own
 * words count) is shown muted. No highlighting: the text is shown plainly.
 */
export function ReplyBody({ body }: { body: string }) {
  const { own, quoted } = splitQuoted(body);
  return (
    <div className="text-sm leading-relaxed">
      <p className="whitespace-pre-wrap break-words">{own}</p>
      {quoted && <p className="mt-3 whitespace-pre-wrap break-words border-l-2 border-neutral-300 pl-3 text-neutral-400">{quoted}</p>}
    </div>
  );
}

/** Whether a body is long enough to need "Show more". */
export const isLongBody = (body: string) => body.length > 320 || body.split("\n").length > 6;
