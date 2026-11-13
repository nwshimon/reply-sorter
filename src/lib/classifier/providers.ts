import OpenAI from "openai";
import { RESPONSE_JSON_SCHEMA } from "./schema";

// The only place that makes a network call to a model. One OpenAI-compatible client: the provider is chosen
// by LLM_BASE_URL + LLM_API_KEY (Cerebras today), so changing provider means changing environment variables,
// not code. Every failure becomes a ProviderError that classify() turns into needs_human / classifier_error.
// The API key is never put in a message, log or error.

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

/** The one method of the OpenAI client this code uses, so tests can pass a fake. */
export type ChatClient = {
  chat: { completions: { create: (body: Record<string, unknown>, options?: { signal?: AbortSignal; timeout?: number }) => Promise<unknown> } };
};

export type LlmOptions = {
  apiKey?: string;
  baseUrl?: string;
  /** Per attempt. CLAUDE.md: 15 seconds. */
  timeoutMs?: number;
  /** Extra attempts after a timeout, network error, 5xx, or a failed strict-JSON generation. */
  retries?: number;
  /**
   * On HTTP 429, wait up to this long in total and try again. 0 (default) fails straight away: right for the
   * paste box, where the page has a 30 s limit. The batch script sets a larger value.
   */
  maxRateLimitWaitMs?: number;
  client?: ChatClient;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Cerebras doesn't document a retry-after header; its free tier is 5 requests a minute, so ~13 s clears a request slot. */
const DEFAULT_RATE_LIMIT_WAIT_S = 13;

type ApiFailure = { name?: string; status?: number; message?: string; headers?: unknown; error?: unknown };

function headerValue(headers: unknown, name: string): string | null {
  if (!headers) return null;
  if (typeof (headers as { get?: unknown }).get === "function") return (headers as Headers).get(name);
  const v = (headers as Record<string, unknown>)[name];
  return typeof v === "string" ? v : null;
}

/** An OpenAI-compatible chat client for the configured provider. Throws ProviderError (never returns a failure). */
export function llmProvider(opts: LlmOptions = {}): Provider {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const retries = opts.retries ?? 1;
  const maxRateLimitWaitMs = opts.maxRateLimitWaitMs ?? 0;
  const sleep = opts.sleep ?? defaultSleep;

  return async ({ model, system, user }) => {
    let client = opts.client;
    if (!client) {
      const apiKey = opts.apiKey ?? process.env.LLM_API_KEY;
      const baseURL = opts.baseUrl ?? process.env.LLM_BASE_URL;
      if (!apiKey) throw new ProviderError("LLM_API_KEY is not set", "http", false);
      if (!baseURL) throw new ProviderError("LLM_BASE_URL is not set", "http", false);
      // maxRetries 0: retrying is done here, where the rules (timeout, one retry, 429 waits) are tested.
      client = new OpenAI({ apiKey, baseURL, maxRetries: 0 }) as unknown as ChatClient;
    }

    const body = {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
      reasoning_effort: "low",
      // Hidden reasoning tokens count toward this and toward the per-minute token limit.
      max_completion_tokens: 1500,
      response_format: {
        type: "json_schema",
        json_schema: { name: "reply_classification", strict: true, schema: RESPONSE_JSON_SCHEMA },
      },
    };

    let attemptsLeft = retries + 1;
    let rateLimitWaited = 0;
    let lastError = new ProviderError("no attempt was made", "network", false);

    while (attemptsLeft > 0) {
      const started = Date.now();
      try {
        const completion = (await client.chat.completions.create(body, { signal: AbortSignal.timeout(timeoutMs), timeout: timeoutMs })) as {
          choices?: { message?: { content?: string | null } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const content = completion.choices?.[0]?.message?.content;
        if (!content) throw new ProviderError("The model returned no content", "empty", true);
        return {
          content,
          promptTokens: completion.usage?.prompt_tokens ?? null,
          completionTokens: completion.usage?.completion_tokens ?? null,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        if (err instanceof ProviderError) {
          lastError = err;
        } else {
          const e = err as ApiFailure;
          const text = String(e.message ?? "").slice(0, 200);
          if (e.status === 429) {
            const waitMs = Math.max(1000, Number(headerValue(e.headers, "retry-after") ?? DEFAULT_RATE_LIMIT_WAIT_S) * 1000);
            if (rateLimitWaited + waitMs > maxRateLimitWaitMs) {
              throw new ProviderError(`rate limited (HTTP 429): ${text}`, "rate_limit", false);
            }
            rateLimitWaited += waitMs;
            await sleep(waitMs);
            continue; // waiting out a rate limit doesn't use up an attempt
          }
          if (typeof e.status === "number") {
            const retryable = e.status >= 500 || /json_validate_failed|failed_generation/.test(text);
            lastError = new ProviderError(`The provider returned HTTP ${e.status}: ${text}`, "http", retryable);
          } else if (["TimeoutError", "AbortError", "APIConnectionTimeoutError", "APIUserAbortError"].includes(e.name ?? "")) {
            lastError = new ProviderError(`no answer within ${timeoutMs / 1000}s`, "timeout", true);
          } else {
            lastError = new ProviderError(`network error: ${text}`, "network", true);
          }
        }
        if (!lastError.retryable) throw lastError;
      }
      attemptsLeft--;
    }
    throw lastError;
  };
}
