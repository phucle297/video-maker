/**
 * MiniMax LLM HTTP client, wrapped in Effect.
 *
 * Endpoint: POST {baseUrl}/text/chatcompletion_v2
 * Auth:     Bearer {apiKey}
 *
 * Why manual JSON decode (not Schema.decodeUnknown):
 *   - MiniMax's response message carries extra fields (`name`, `audio_content`)
 *     that change without notice. A strict `Schema.Struct` rejects them as
 *     "shape mismatch" even when the call succeeded.
 *   - The endpoint also rejects `response_format: { type: "json_object" }`
 *     (status 2013) — we rely on the system prompt to ask for JSON and
 *     `JSON.parse(content)` to extract it.
 *
 * Why this lives in its own service:
 *   - The LLM endpoint is the single biggest external dependency
 *   - It has its own retry policy, timeout, and error shape
 *   - It's mockable in tests by providing a different LLMService
 */

import { Effect, Redacted, Schema } from "effect";
import {
  MiniMaxApiKey,
  MiniMaxLlmModel,
  MiniMaxLlmTemperature,
  MiniMaxLlmUrl,
} from "../lib/config";
import { LLMError } from "../lib/errors";
import { LlmRetry } from "../lib/retry";

// ---------- request schema (encode only — output is what we send) ----------

const ChatMessage = Schema.Struct({
  role: Schema.Literal("system", "user", "assistant"),
  content: Schema.String,
});
type ChatMessage = Schema.Schema.Type<typeof ChatMessage>;

const ChatRequestBody = Schema.Struct({
  model: Schema.String,
  messages: Schema.Array(ChatMessage),
  temperature: Schema.Number,
});

// ---------- response shape (defensive manual decode, see header) ----------

interface ParsedUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ---------- service ----------

export interface LLMRequest {
  system: string;
  user: string;
  /** Optional override of the default temperature. */
  temperature?: number;
}

export interface LLMResponseUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export class LLMService extends Effect.Service<LLMService>()("app/LLMService", {
  effect: Effect.gen(function* () {
    const apiKey = Redacted.value(yield* MiniMaxApiKey);
    const baseUrl = yield* MiniMaxLlmUrl;
    const model = yield* MiniMaxLlmModel;
    const defaultTemp = yield* MiniMaxLlmTemperature;

    // The single primitive: send a prompt, get raw JSON back.
    // The CALLER decides how to validate / decode it.
    const completeJSON = (req: LLMRequest) =>
      Effect.gen(function* () {
        const body = yield* Schema.encode(ChatRequestBody)({
          model,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          temperature: req.temperature ?? defaultTemp,
        });

        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(`${baseUrl}/text/chatcompletion_v2`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify(body),
            }),
          catch: (e) =>
            new LLMError({
              message: "MiniMax LLM fetch failed",
              cause: e,
            }),
        });

        if (response.status === 429 || response.status >= 500) {
          // Transient — let the retry schedule handle it
          return yield* Effect.fail(
            new LLMError({
              message: `MiniMax LLM transient error ${response.status}`,
              status: response.status,
            }),
          );
        }

        if (!response.ok) {
          const errorText = yield* Effect.tryPromise({
            try: () => response.text(),
            catch: () => "could not read error body",
          });
          return yield* Effect.fail(
            new LLMError({
              message: `MiniMax LLM ${response.status}: ${errorText.slice(0, 300)}`,
              status: response.status,
            }),
          );
        }

        const responseJson = yield* Effect.tryPromise({
          try: () => response.json() as Promise<unknown>,
          catch: (e) =>
            new LLMError({
              message: "MiniMax LLM: failed to parse response JSON",
              cause: e,
            }),
        });

        // Surface MiniMax's structured error envelope (e.g. status 200 with
        // body {"base_resp":{"status_code":2013,"status_msg":"..."}}).
        if (isObject(responseJson) && isObject(responseJson.base_resp)) {
          const br = responseJson.base_resp;
          if (typeof br.status_code === "number" && br.status_code !== 0) {
            return yield* Effect.fail(
              new LLMError({
                message: `MiniMax LLM api error ${br.status_code}: ${br.status_msg ?? "unknown"}`,
              }),
            );
          }
        }

        // Manual defensive decode — tolerate unknown fields at any depth.
        const content = extractContent(responseJson);
        if (content === null) {
          return yield* Effect.fail(
            new LLMError({
              message: "MiniMax LLM: response missing choices[0].message.content",
              cause: responseJson,
            }),
          );
        }

        const usage = extractUsage(responseJson);

        // Parse the content as JSON
        const jsonContent = yield* Effect.try({
          try: () => JSON.parse(content),
          catch: (e) =>
            new LLMError({
              message: "MiniMax LLM: content is not valid JSON",
              cause: e,
            }),
        });

        return { json: jsonContent, content, usage };
      }).pipe(
        // Retry transient failures with the LLM schedule
        Effect.retry(LlmRetry),
        // Cap the whole call at 5 minutes — a 3-4 min script with full
        // narration + visual prompts can take 1-3 min to generate.
        Effect.timeout("5 minutes"),
        Effect.tapError((e) => Effect.logError("LLM call failed", e)),
      );

    return { completeJSON } as const;
  }),
}) {}

// TODO(permees): switch brief generation to SSE streaming.
//
// Add `completeJSONStream(req): Stream.Stream<LLMDelta, LLMError>` that POSTs
// with `stream: true` to `/text/chatcompletion_v2` and yields each
// `choices[0].delta.content` token. The endpoint returns lines like
//   data: {"choices":[{"delta":{"content":"...","role":"assistant","name":"MiniMax AI","audio_content":""},"finish_reason":null}]}
//   data: [DONE]
// Use `ReadableStream` from `response.body` and a TextDecoder line splitter.
// Then add `ScriptService.generateStream(input): Stream<BriefGenEvent, ...>`
// that emits {type:"thinking"} → {type:"token", text}* → {type:"saving"} →
// {type:"done", script} and delegates the final JSON.parse + Schema decode +
// save to JobService. New route `src/app/api/briefs/stream/route.ts` (mirror
// the pattern in `src/app/api/jobs/[jobId]/render/route.ts`) wraps the
// stream as text/event-stream. `src/components/brief-form.tsx` switches from
// `useTransition` + `createBrief` server action to `fetch().body.getReader()`
// consuming the SSE stream, showing live tokens in a thinking panel before
// redirecting on `done`. Motivation: brief generation currently blocks the
// server action for up to 5 min and the user sees no progress.


// ---------- helpers ----------

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function extractContent(raw: unknown): string | null {
  if (!isObject(raw)) return null;
  const choices = raw.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (!isObject(first)) return null;
  const message = first.message;
  if (!isObject(message)) return null;
  return typeof message.content === "string" ? message.content : null;
}

function extractUsage(raw: unknown): LLMResponseUsage | undefined {
  if (!isObject(raw)) return undefined;
  const usage = raw.usage;
  if (!isObject(usage)) return undefined;
  const p = usage.prompt_tokens;
  const c = usage.completion_tokens;
  const t = usage.total_tokens;
  if (typeof p !== "number" || typeof c !== "number" || typeof t !== "number") {
    return undefined;
  }
  return { promptTokens: p, completionTokens: c, totalTokens: t };
}

// keep the type alias referenced so it isn't tree-shaken (also documents intent)
type _UsageAlias = ParsedUsage;
