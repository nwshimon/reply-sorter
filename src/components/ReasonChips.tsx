import { OVERRIDE_REASONS, REVIEW_REASONS } from "@/lib/policy";

const SERIOUS = new Set(["classifier_error", "manipulation_language", "status_update_request", "other_invoice_mentioned"]);

/** Why a reply is in the review queue. Unknown keys (from a future policy version) are shown as written. */
export function ReviewReasonChips({ reasons }: { reasons: readonly string[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {reasons.map((key) => (
        <li
          key={key}
          className={`rounded-md px-2 py-0.5 text-xs ${
            SERIOUS.has(key)
              ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-950 dark:text-red-300 dark:ring-red-400/30"
              : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/30"
          }`}
        >
          {REVIEW_REASONS[key as keyof typeof REVIEW_REASONS] ?? key}
        </li>
      ))}
    </ul>
  );
}

/** Rules that changed the model's answer: the explanation for any gap between model and final. */
export function OverrideList({ reasons }: { reasons: readonly string[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
      {reasons.map((key) => (
        <li key={key} className="flex gap-2">
          <span aria-hidden className="text-neutral-400">↳</span>
          {OVERRIDE_REASONS[key as keyof typeof OVERRIDE_REASONS] ?? key}
        </li>
      ))}
    </ul>
  );
}
