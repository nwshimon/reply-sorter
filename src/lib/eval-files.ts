// Reads the committed evaluation results (eval/results-<prompt>-<model>.json and eval/heldout-results-…). The /eval page
// shows exactly what is in the repo, so a reviewer can reproduce every number. Server-only (uses the file system).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { EvalResult } from "@/db/eval";
import { acceptableFor, summarizeStress, type StressLabel, type StressRun } from "./stress";

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

export type StressFile = StressRun & { file: string };

/** The saved stress runs (eval/stress-<prompt>-<model>-<split>.json), newest prompt version first. */
export function loadStressFiles(): StressFile[] {
  const dir = path.join(process.cwd(), "eval");
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((f) => /^stress-.+\.json$/.test(f));
  } catch {
    return [];
  }
  // The labels are the source of truth for what is expected. A saved run records only what the SYSTEM did; the expected
  // answer, rule, group and pair come from the current labels file, so editing a label re-grades old runs instead of
  // leaving them stale. (The summary is re-derived for the same reason.)
  let labels = new Map<string, StressLabel>();
  try {
    labels = new Map((JSON.parse(readFileSync(path.join(process.cwd(), "data", "stress-labels.json"), "utf8")) as StressLabel[]).map((l) => [l.id, l]));
  } catch {
    // Without the labels file the saved values are used as they are.
  }
  const out: StressFile[] = [];
  for (const file of names) {
    try {
      const run = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as StressRun;
      if (run.kind !== "stress") continue;
      const rows = run.rows.map((r) => {
        const l = labels.get(r.id);
        return l ? { ...r, label: l.display_category, acceptable: acceptableFor(l), rule: l.rule, group: l.group, pair: l.pair, split: l.split } : r;
      });
      out.push({ ...run, rows, summary: summarizeStress(rows), file: file.replace(/\.json$/, "") });
    } catch {
      // A malformed file is skipped rather than breaking the page.
    }
  }
  return out.sort((a, b) => versionNumber(b.promptVersion) - versionNumber(a.promptVersion) || a.split.localeCompare(b.split) || a.model.localeCompare(b.model));
}
