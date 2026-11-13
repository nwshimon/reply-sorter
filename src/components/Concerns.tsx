import { OVERRIDE_REASONS } from "@/lib/policy";

/** Why a reply is in the queue, as plain text (never pills): "Concerns: A · B". */
export function ConcernsLine({ concerns }: { concerns: readonly string[] }) {
  return (
    <p className="text-sm text-neutral-700">
      <span className="font-medium text-ink">Concerns:</span> {concerns.join(" · ")}
    </p>
  );
}

/** Rules that changed the model's answer: the explanation for any gap between model and final. */
export function OverrideList({ reasons }: { reasons: readonly string[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm text-neutral-700">
      {reasons.map((key) => (
        <li key={key} className="flex gap-2">
          <span aria-hidden className="text-neutral-400">↳</span>
          {OVERRIDE_REASONS[key as keyof typeof OVERRIDE_REASONS] ?? key}
        </li>
      ))}
    </ul>
  );
}
