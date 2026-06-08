/**
 * ScriptService — orchestrates the LLM call, schema decode, and validation.
 *
 * This is the entry point for "generate a script from a brief".
 * Returns a typed Script (or a tagged error).
 */

import { Config, Effect, Layer, Schedule, Schema } from "effect";
import { BriefInput, Script } from "./schema.js";
import { LLMService } from "./llm.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompts.js";
import { validateScript } from "./validation.js";
import { DefaultLang, DefaultAspect } from "../lib/config.js";
import { LlmRetry } from "../lib/retry.js";
import { ValidationError } from "../lib/errors.js";

export class ScriptService extends Effect.Service<ScriptService>()("app/ScriptService", {
  effect: Effect.gen(function* () {
    const llm = yield* LLMService;
    const defaultLang = yield* DefaultLang;
    const defaultAspect = yield* DefaultAspect;

    const generate = (input: BriefInput) =>
      Effect.gen(function* () {
        const enriched: BriefInput = {
          ...input,
          lang: input.lang ?? (defaultLang as "vi" | "en"),
          aspectRatio: input.aspectRatio ?? (defaultAspect as "9:16" | "16:9" | "1:1"),
        };

        yield* Effect.logInfo("generating script").pipe(
          Effect.annotateLogs({
            storyType: enriched.storyType,
            theme: enriched.theme,
            lengthMinutes: enriched.lengthMinutes,
          }),
        );

        const llmResult = yield* llm
          .completeJSON({
            system: buildSystemPrompt(enriched.storyType),
            user: buildUserPrompt(enriched),
          })
          .pipe(
            Effect.retry(LlmRetry),
            Effect.timeout("90 seconds"),
            Effect.tapError((e) => Effect.logError("LLM call failed", e)),
          );

        // Schema decode is an Effect — invalid output is a typed error
        const script = yield* Schema.decodeUnknown(Script)(llmResult.json).pipe(
          Effect.mapError(
            (e) =>
              new ValidationError({
                message: `LLM output did not match Script schema: ${e.message}`,
                cause: e,
              }),
          ),
        );

        // Cross-field validation
        const validated = yield* validateScript(script, enriched.lengthMinutes);

        yield* Effect.logInfo("script generated", {
          title: validated.title,
          segments: validated.segments.length,
          totalDuration: validated.totalDuration,
        });

        return validated;
      });

    return { generate } as const;
  }),
  dependencies: [LLMService.Default],
}) {}

// Re-export the schema so callers can grab types in one place
export { Script, BriefInput } from "./schema.js";
