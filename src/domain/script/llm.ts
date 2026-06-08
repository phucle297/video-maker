/**
 * MiniMax LLM HTTP client, wrapped in Effect.
 *
 * Why this lives in its own service:
 *   - The LLM endpoint is the single biggest external dependency
 *   - It has its own retry policy, timeout, and error shape
 *   - It's mockable in tests by providing a different LLMService
 */

import { Config, Effect, Layer, Schedule, Schema } from "effect";
import {
  MiniMaxApiKey,
  MiniMaxLlmModel,
  MiniMaxLlmTemperature,
  MiniMaxLlmUrl,
} from "../lib/config.js";
import { LLMError } from "../lib/errors.js";
import { LlmRetry } from "../lib/retry.js";

// ---------- request/response schemas (defensive) ----------

const ChatMessage = Schema.Struct({
  role: Schema.Literal("system", "user", "assistant"),
  content: Schema.String,
});
type ChatMessage = Schema.Schema.Type<typeof ChatMessage>;

const ChatRequestBody = Schema.Struct({
  model: Schema.String,
  messages: Schema.Array(ChatMessage),
  temperature: Schema.Number,
  response_format: Schema.optional(Schema.Struct({ type: Schema.Literal("json_object") })),
});

const ChatChoice = Schema.Struct({
  index: Schema.Number,
  message: Schema.Struct({
    role: Schema.Literal("assistant"),
    content: Schema.String,
  }),
  finish_reason: Schema.optional(Schema.String),
});

const ChatResponse = Schema.Struct({
  id: Schema.String,
  model: Schema.String,
  choices: Schema.Array(ChatChoice),
  usage: Schema.optional(
    Schema.Struct({
      prompt_tokens: Schema.Number,
      completion_tokens: Schema.Number,
      total_tokens: Schema.Number,
    }),
  ),
});

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
    const apiKey = yield* MiniMaxApiKey;
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
            { role: "system" as const, content: req.system },
            { role: "user" as const, content: req.user },
          ],
          temperature: req.temperature ?? defaultTemp,
          response_format: { type: "json_object" as const },
        });

        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(`${baseUrl}/text/chatcompletion_v2`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body,
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
          }).pipe(Effect.orElseSucceed(() => "could not read error body"));
          return yield* Effect.fail(
            new LLMError({
              message: `MiniMax LLM ${response.status}: ${errorText.slice(0, 300)}`,
              status: response.status,
            }),
          );
        }

        const responseJson = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: (e) =>
            new LLMError({
              message: "MiniMax LLM: failed to parse response JSON",
              cause: e,
            }),
        });

        const parsed = yield* Schema.decodeUnknown(ChatResponse)(responseJson).pipe(
          Effect.mapError(
            (e) =>
              new LLMError({
                message: "MiniMax LLM: response shape mismatch",
                cause: e,
              }),
          ),
        );

        const firstChoice = parsed.choices[0];
        if (!firstChoice) {
          return yield* Effect.fail(
            new LLMError({ message: "MiniMax LLM: no choices in response" }),
          );
        }

        const content = firstChoice.message.content;
        const usage: LLMResponseUsage | undefined = parsed.usage
          ? {
              promptTokens: parsed.usage.prompt_tokens,
              completionTokens: parsed.usage.completion_tokens,
              totalTokens: parsed.usage.total_tokens,
            }
          : undefined;

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
        // Cap the whole call at 90 seconds
        Effect.timeout("90 seconds"),
        Effect.tapError((e) => Effect.logError("LLM call failed", e)),
      );

    return { completeJSON } as const;
  }),
  // The service needs Config primitives; Effect provides them automatically
  // through the Layer system, but we list them for clarity.
  dependencies: [],
}) {}

// ---------- test layer (mock) ----------

export const LLMServiceTest = (responses: Record<string, unknown>) =>
  Layer.succeed(LLMService, {
    completeJSON: (_req: LLMRequest) =>
      Effect.succeed({
        json: responses["default"] ?? {},
        content: JSON.stringify(responses["default"] ?? {}),
        usage: undefined,
      }),
  } as unknown as LLMService);
