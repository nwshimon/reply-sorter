// Reads the committed evaluation results (eval/results-<prompt>-<model>.json and eval/heldout-results-…). The /eval page
// shows exactly what is in the repo, so a reviewer can reproduce every number. Server-only (uses the file system).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { EvalResult } from "@/db/eval";

export type EvalFile = EvalResult & { file: string };

export function loadEvalFiles(): EvalFile[] {
  const dir = path.join(process.cwd(), "eval");
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((f) => /^(heldout-)?results-.+\.json$/.test(f));
  } catch {
    return [];
  }
  const out: EvalFile[] = [];
  for (const file of names) {
    try {
      out.push({ ...(JSON.parse(readFileSync(path.join(dir, file), "utf8")) as EvalResult), file: file.replace(/\.json$/, "") });
    } catch {
      // A malformed file is skipped rather than breaking the page.
    }
  }
  return out;
}

/** "v2" → 2, so versions sort numerically (v10 after v9). */
export const versionNumber = (v: string) => Number(v.replace(/\D/g, "")) || 0;

/** Newest prompt version first, then the most recently generated. */
export const newestFirst = (a: EvalFile, b: EvalFile) => versionNumber(b.promptVersion) - versionNumber(a.promptVersion) || b.generatedAt.localeCompare(a.generatedAt);
