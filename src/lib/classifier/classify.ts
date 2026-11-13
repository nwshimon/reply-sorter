import { applyPolicy, failureResult, type PolicyResult, type ReplyContext } from "../policy";
import { buildUserMessage, CLOSING_TAG, ESCAPED_CLOSING_TAG, promptVersion, SYSTEM_PROMPT } from "./prompt";
import { llmProvider, ProviderError, type Provider } from "./providers";
import { ModelOutput } from "./schema";

// THE one entry point: model → check output → policy → result. The batch script, /try and the
// evaluation all call this; never write a second path. It never throws: any failure (timeout,
// API error, unusable output, bad config) comes back as needs_human / classifier_error.

export type ClassifyInput = ReplyContext & { currency: string; dueDate: string };

export type ClassifyResult = {
  model: string;
  promptVersion: string;
  policy: PolicyResult;
  /** The model's JSON after the Zod check, exactly as returned (before code changed anything). */
  rawOutput: ModelOutput | null;
  /** Why the run failed, or null. A failed run is stored but doesn't count as a result. */
  error: string | null;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
};

export type ClassifyOptions = {
  provider?: Provider;
  model?: string;
  promptVersion?: string;
};

/** A pasted reply this long would eat the token budget; refuse it rather than truncate it. */
export const MAX_BODY_CHARS = 6000;

/**
 * Code's half of the pipeline: the model's validated output → the final result. Shared by classify()
 * and reapply-policy.ts, so re-running the rules on a stored raw_output gives exactly what a fresh
 * run would. The prompt escaped any closing tag in the body; undo that in the quote so it can match.
 */
export function policyFromRaw(raw: ModelOutput, input: ReplyContext): PolicyResult {
  return applyPolicy({ ...raw, evidence_quote: raw.evidence_quote.replaceAll(ESCAPED_CLOSING_TAG, CLOSING_TAG) }, input);
}

export async function classify(input: ClassifyInput, opts: ClassifyOptions = {}): Promise<ClassifyResult> {
  const model = opts.model ?? process.env.CLASSIFIER_MODEL ?? "";
  const version = opts.promptVersion ?? promptVersion();
  const fail = (error: string, extra: Partial<ClassifyResult> = {}): ClassifyResult => ({
    model,
    promptVersion: version,
    policy: failureResult(),
    rawOutput: null,
    error,
    latencyMs: null,
    promptTokens: null,
    completionTokens: null,
    ...extra,
  });

  if (!model) return fail("CLASSIFIER_MODEL is not set");
  if (!version) return fail("PROMPT_VERSION is not set");
  if (input.body.length > MAX_BODY_CHARS) return fail(`reply is ${input.body.length} characters; the limit is ${MAX_BODY_CHARS}`);

  const provider = opts.provider ?? llmProvider();

  let content: string;
  let usage: Pick<ClassifyResult, "latencyMs" | "promptTokens" | "completionTokens">;
  try {
    const res = await provider({ model, system: SYSTEM_PROMPT, user: buildUserMessage(input) });
    content = res.content;
    usage = { latencyMs: res.latencyMs, promptTokens: res.promptTokens, completionTokens: res.completionTokens };
  } catch (err) {
    const kind = err instanceof ProviderError ? err.kind : "unknown";
    return fail(`${kind}: ${err instanceof Error ? err.message : String(err)}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return fail("invalid_output: the model's answer is not JSON", usage);
  }
  const parsed = ModelOutput.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(`invalid_output: ${issue.path.join(".") || "(root)"}: ${issue.message}`, usage);
  }

  return {
    model,
    promptVersion: version,
    policy: policyFromRaw(parsed.data, input),
    rawOutput: parsed.data,
    error: null,
    ...usage,
  };
}
