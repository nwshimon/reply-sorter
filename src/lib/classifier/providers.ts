import { GROQ_JSON_SCHEMA } from "./schema";

// The only place that makes a network call to a model. Every failure becomes a ProviderError
// that classify() turns into needs_human / classifier_error. The API key is never put in a
// message, log or error.

export type ProviderRequest = { model: string; system: string; user: string };
export type ProviderResult = {
  content: string;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
};
export type Provider = (req: ProviderRequest) => Promise<ProviderResult>;

export type ProviderErrorKind = "timeout" | "network" | "rate_limit" | "http" | "empty";
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderErrorKind,
    /** Worth another attempt (timeouts, network errors, 5xx, a failed strict-JSON generation). */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type GroqOptions = {
  apiKey?: string;
  /** Per attempt. CLAUDE.md: 15 seconds. */
  timeoutMs?: number;
  /** Extra attempts after a timeout, network error, 5xx, or a failed strict-JSON generation. */
  retries?: number;
  /**
   * On HTTP 429, wait up to this long in total (using the retry-after header) and try again.
   * 0 (default) fails straight away: right for /try, where the page has a 30 s limit.
   * The batch script sets a larger value.
   */
  maxRateLimitWaitMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function groqProvider(opts: GroqOptions = {}): Provider {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const retries = opts.retries ?? 1;
  const maxRateLimitWaitMs = opts.maxRateLimitWaitMs ?? 0;
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;

  return async ({ model, system, user }) => {
    const apiKey = opts.apiKey ?? process.env.GROQ_API_KEY;
    if (!apiKey) throw new ProviderError("GROQ_API_KEY is not set", "http", false);

    const body = JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
      reasoning_effort: "low",
      // Hidden reasoning tokens count toward this and toward the 8K tokens/min limit.
      max_completion_tokens: 1500,
      response_format: {
        type: "json_schema",
        json_schema: { name: "reply_classification", strict: true, schema: GROQ_JSON_SCHEMA },
      },
    });

    let attemptsLeft = retries + 1;
    let rateLimitWaited = 0;
    let lastError = new ProviderError("no attempt was made", "network", false);

    while (attemptsLeft > 0) {
      const started = Date.now();
      try {
        const res = await doFetch(GROQ_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.status === 429) {
          const waitMs = Math.max(1000, Number(res.headers.get("retry-after") ?? "20") * 1000);
          if (rateLimitWaited + waitMs > maxRateLimitWaitMs) {
            throw new ProviderError(`rate limited (HTTP 429); retry-after ${Math.round(waitMs / 1000)}s`, "rate_limit", false);
          }
          rateLimitWaited += waitMs;
          await sleep(waitMs);
          continue; // waiting out a rate limit doesn't use up an attempt
        }

        if (!res.ok) {
          const text = (await res.text().catch(() => "")).slice(0, 200);
          const retryable = res.status >= 500 || /json_validate_failed|failed_generation/.test(text);
          throw new ProviderError(`Groq returned HTTP ${res.status}: ${text}`, "http", retryable);
        }

        const data = (await res.json()) as {
          choices?: { message?: { content?: string | null } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new ProviderError("Groq returned no content", "empty", true);
        return {
          content,
          promptTokens: data.usage?.prompt_tokens ?? null,
          completionTokens: data.usage?.completion_tokens ?? null,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        if (err instanceof ProviderError) lastError = err;
        else if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
          lastError = new ProviderError(`no answer within ${timeoutMs / 1000}s`, "timeout", true);
        } else {
          lastError = new ProviderError(`network error: ${err instanceof Error ? err.message : String(err)}`, "network", true);
        }
        if (!lastError.retryable) throw lastError;
      }
      attemptsLeft--;
    }
    throw lastError;
  };
}
