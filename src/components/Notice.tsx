/** A short confirmation (or error) after an action. The text comes from the URL, so it's only ever rendered as text. */
export function Notice({ message, kind }: { message?: string; kind?: string }) {
  if (!message) return null;
  const error = kind === "error";
  return (
    <p
      role={error ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-sm ${error ? "border-red-300 bg-red-50 text-red-800" : "border-green-300 bg-green-50 text-green-800"}`}
    >
      {message.slice(0, 160)}
    </p>
  );
}
