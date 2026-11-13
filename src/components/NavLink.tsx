"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A sidebar link that highlights itself on its own page (and, for /replies, on reply detail pages). */
export function NavLink({ href, children, dotLabel }: { href: string; children: React.ReactNode; dotLabel?: string }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active ? "bg-tan text-ink" : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {dotLabel && <span role="img" aria-label={dotLabel} title={dotLabel} className="h-2 w-2 shrink-0 rounded-full bg-flag" />}
      {children}
    </Link>
  );
}
