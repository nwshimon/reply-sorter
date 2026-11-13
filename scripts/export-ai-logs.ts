// Export Claude Code session transcripts into ai-logs/ with secrets redacted.
//
//   npx tsx scripts/export-ai-logs.ts          export every session transcript for this project
//   npx tsx scripts/export-ai-logs.ts --check  scan ai-logs/ for secret-shaped strings (exit 1 if any)
//
// Also runs as a PreCompact hook (see .claude/settings.json): the hook passes JSON on stdin with the
// transcript path. Redaction is by PATTERN only. It never reads .env.local, and it prints counts per
// pattern, never the matched values.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const root = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
const outDir = join(root, "ai-logs");

// name, pattern. Order matters: more specific first.
const PATTERNS: [string, RegExp][] = [
  ["groq-key", /gsk_[A-Za-z0-9]{20,}/g],
  ["google-api-key", /AIza[0-9A-Za-z_-]{30,}/g],
  ["neon-password", /npg_[A-Za-z0-9]{10,}/g],
  ["postgres-url", /postgres(?:ql)?:\/\/[^\s"'\\<>)]+/gi],
  ["jwt", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ["bearer-token", /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/g],
  ["vercel-token", /\b(?:vcp|vca|vci|vck|vcr)_[A-Za-z0-9]{20,}/g],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/g],
  // NAME=value assignments for secret-looking names, with a long literal value.
  [
    "env-assignment",
    /\b((?:[A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY)|DATABASE_URL(?:_UNPOOLED)?|POSTGRES_URL[A-Z_]*|PGPASSWORD|VERCEL_OIDC_TOKEN))\s*=\s*"?([^\s"'\\]{16,})/g,
  ],
];

function redact(text: string): { text: string; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  let out = text;
  for (const [name, re] of PATTERNS) {
    out = out.replace(re, (...m) => {
      counts[name] = (counts[name] ?? 0) + 1;
      // For NAME=value keep the name so the transcript still reads sensibly.
      return name === "env-assignment" ? `${m[1]}=[REDACTED:${name}]` : `[REDACTED:${name}]`;
    });
  }
  return { text: out, counts };
}

function leaks(text: string): Record<string, number> {
  const found: Record<string, number> = {};
  for (const [name, re] of PATTERNS) {
    const n = [...text.matchAll(new RegExp(re.source, re.flags))].filter((m) => !m[0].includes("[REDACTED:")).length;
    if (n > 0) found[name] = n;
  }
  return found;
}

function stamp(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); // 20261113T140300Z
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  // A hook sends its JSON and closes stdin at once. A non-interactive shell may never close it,
  // so give up after a second instead of hanging.
  const chunks: Buffer[] = [];
  await new Promise<void>((done) => {
    const timer = setTimeout(done, 1000);
    process.stdin.on("data", (c) => chunks.push(c as Buffer));
    process.stdin.on("end", () => {
      clearTimeout(timer);
      done();
    });
    process.stdin.on("error", done);
  });
  process.stdin.pause();
  return Buffer.concat(chunks).toString("utf8");
}

function projectTranscriptDir(): string {
  // Claude Code keeps transcripts in ~/.claude/projects/<project path with / replaced by ->.
  return join(homedir(), ".claude", "projects", root.replace(/[/.]/g, "-"));
}

async function main() {
  if (process.argv.includes("--check")) {
    if (!existsSync(outDir)) return console.log("ai-logs/ doesn't exist");
    let bad = 0;
    for (const f of readdirSync(outDir)) {
      if (f.toLowerCase() === "readme.md") continue;
      const found = leaks(readFileSync(join(outDir, f), "utf8"));
      if (Object.keys(found).length) {
        bad++;
        console.log(`LEAK ${f}:`, found);
      }
    }
    console.log(bad ? `${bad} file(s) with secret-shaped strings` : "ai-logs/: no secret-shaped strings found");
    process.exit(bad ? 1 : 0);
  }

  // Sources: the transcript a hook passed in, plus every transcript for this project.
  const sources = new Set<string>();
  const stdin = (await readStdin()).trim();
  if (stdin) {
    try {
      const p = (JSON.parse(stdin) as { transcript_path?: string }).transcript_path;
      if (p && existsSync(p)) sources.add(p);
    } catch {
      // Not JSON: ignore and fall back to the directory scan.
    }
  }
  const dir = projectTranscriptDir();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) if (f.endsWith(".jsonl")) sources.add(join(dir, f));
  }
  if (sources.size === 0) return console.log(`No transcripts found (looked in ${dir})`);

  mkdirSync(outDir, { recursive: true });
  const existing = readdirSync(outDir);
  const now = stamp();

  for (const src of sources) {
    const id = basename(src, ".jsonl").slice(0, 8);
    const { text, counts } = redact(readFileSync(src, "utf8"));
    const hash = createHash("sha256").update(text).digest("hex").slice(0, 12);

    // Skip if an earlier export of this session already has exactly this content.
    const same = existing.some((f) => f.includes(`-${id}-`) && f.endsWith(`-${hash}.jsonl`));
    if (same) {
      console.log(`session ${id}: unchanged since the last export, skipped`);
      continue;
    }
    // Timestamped, never overwritten.
    const name = `session-${now}-${id}-${hash}.jsonl`;
    writeFileSync(join(outDir, name), text);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`session ${id}: wrote ai-logs/${name} (${(text.length / 1024).toFixed(0)} KB, ${total} redactions)`, counts);
  }
}

main().catch((e) => {
  // A failed export must not block a compact; report it and exit cleanly.
  console.error("export-ai-logs failed:", e instanceof Error ? e.message : e);
  process.exit(0);
});
