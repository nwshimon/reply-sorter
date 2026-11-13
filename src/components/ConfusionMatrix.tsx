import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/categories";

/** Rows are my label, columns are what the system said. The diagonal is correct; paid's column is the one to watch. */
export function ConfusionMatrix({ matrix }: { matrix: Record<Category, Record<Category, number>> }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left text-xs font-normal text-neutral-500">my label ↓ · system →</th>
            {CATEGORIES.map((c) => (
              <th key={c} className="px-2 py-1 text-xs font-medium">
                {CATEGORY_LABELS[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((label) => (
            <tr key={label}>
              <th className="whitespace-nowrap px-2 py-1 text-left text-xs font-medium">{CATEGORY_LABELS[label]}</th>
              {CATEGORIES.map((pred) => {
                const n = matrix[label][pred];
                const diagonal = label === pred;
                // A reply marked paid that isn't paid: the costliest cell.
                const falsePaid = pred === "paid" && label !== "paid" && n > 0;
                return (
                  <td
                    key={pred}
                    className={`h-9 min-w-16 border border-neutral-200 text-center tabular-nums dark:border-neutral-800 ${
                      falsePaid
                        ? "bg-red-100 font-semibold text-red-800 dark:bg-red-950 dark:text-red-300"
                        : n === 0
                          ? "text-neutral-300 dark:text-neutral-700"
                          : diagonal
                            ? "bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : "bg-amber-50 font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                    }`}
                  >
                    {n === 0 ? "·" : n}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
