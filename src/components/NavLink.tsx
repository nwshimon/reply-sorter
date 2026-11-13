"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * A sidebar link that highlights itself on its own page. `also` lists extra path prefixes that belong to it
 * (Replies owns the reply detail pages). `badge` is the open count beside Review.
 */
export function NavLink({ href, children, also = [], badge }: { href: string; children: React.ReactNode; also?: string[]; badge?: number }) {
  const path = usePathname();
  const own = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
  const active = own || also.some((p) => path === p || path.startsWith(`${p}/`));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-medium transition md:px-3 md:text-sm ${
        active ? "bg-tan text-ink" : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold leading-none text-white" aria-label={`${badge} open`}>
          {badge}
        </span>
      )}
    </Link>
  );
}
