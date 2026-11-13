/** Why a reply is where it is. Neutral outlines on purpose: colour is reserved for the category pills. */
export function ReasonChips({ chips }: { chips: readonly string[] }) {
  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Reasons">
      {chips.map((c) => (
        <li key={c} className="rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-xs text-neutral-700">
          {c}
        </li>
      ))}
    </ul>
  );
}
