"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that locks while its form's Server Action runs. Every button in the same form is disabled
 * together (so Save and Keep can't both fire), and only the one that was pressed shows `pendingText`.
 * `name` + `value` identify which action was pressed.
 */
export function SubmitButton({
  children,
  pendingText,
  className,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingText: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending, data } = useFormStatus();
  const pressed = pending && (name === undefined || data?.get(name) === value);
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-busy={pressed}
      className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`}
    >
      {pressed ? pendingText : children}
    </button>
  );
}
