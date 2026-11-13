import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { replies } from "@/db/schema";

// Connectivity check for the database and the model provider. Spends zero model tokens:
// Groq's /models endpoint lists available models without running one.
export const dynamic = "force-dynamic";

type Check = { ok: boolean; ms: number; detail: string };

async function timed(fn: () => Promise<string>): Promise<Check> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { ok: true, ms: Date.now() - start, detail };
  } catch (err) {
    // Message only: never echo connection strings or keys.
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, ms: Date.now() - start, detail: message.replace(/postgres(ql)?:\/\/\S+/gi, "[url]") };
  }
}

export async function GET() {
  const model = process.env.CLASSIFIER_MODEL ?? null;
  const promptVersion = process.env.PROMPT_VERSION ?? null;

  const [database, groq] = await Promise.all([
    timed(async () => {
      const [{ n }] = await getDb()
        .select({ n: sql<number>`count(*)::int` })
        .from(replies);
      return `connected; ${n} replies stored`;
    }),
    timed(async () => {
      if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Groq returned HTTP ${res.status}`);
      const { data } = (await res.json()) as { data: { id: string }[] };
      if (!model) throw new Error("CLASSIFIER_MODEL is not set");
      if (!data.some((m) => m.id === model)) throw new Error(`key works, but ${model} is not available`);
      return `key valid; ${model} available`;
    }),
  ]);

  const ok = database.ok && groq.ok;
  return Response.json(
    { ok, model, promptVersion, checks: { database, groq }, checkedAt: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
