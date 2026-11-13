"use client";

import { useState } from "react";

/** Shows up to 6 lines, then "Show more". `long` is decided on the server from the text's length. */
export function ClampedText({ children, long }: { children: React.ReactNode; long: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className={!open && long ? "line-clamp-6" : undefined}>{children}</div>
      {long && (
        <button type="button" onClick={() => setOpen(!open)} className="mt-1 text-xs font-medium text-neutral-600 underline underline-offset-2 hover:text-ink">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
