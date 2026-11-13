/** A collapsible block: a heading you click to open or close. Native <details>, so no JavaScript. */
export function Block({ title, open = false, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-xl border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block text-neutral-400 transition group-open:rotate-90">▸</span>
        {title}
      </summary>
      <div className="space-y-3 border-t border-neutral-100 p-4">{children}</div>
    </details>
  );
}
