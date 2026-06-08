/**
 * ScriptService — orchestrates the LLM call, schema decode, and validation.
 *
 * This is the entry point for "generate a script from a brief".
 * Returns a typed Script (or a tagged error).
 */

import { Effect, Schema } from "effect";
import { BriefInput, Script } from "./schema";
import { LLMService } from "./llm";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import { validateScript } from "./validation";
import { DefaultLang, DefaultAspect } from "../lib/config";
import { ValidationError } from "../lib/errors";

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

        const llmResult = yield* llm.completeJSON({
          system: buildSystemPrompt(enriched.storyType),
          user: buildUserPrompt(enriched),
        });

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

        // Cross-field validation (validateScript is sync-throws; wrap with Effect.try)
        const validated: Script = yield* Effect.try({
          try: () => validateScript(script, enriched.lengthMinutes),
          catch: (e) => {
            if (e instanceof ValidationError) return e;
            return new ValidationError({
              message: `validation failed: ${String(e)}`,
              cause: e,
            });
          },
        });

        // User-supplied voice from the brief is authoritative — override whatever
        // the LLM echoed into ttsVoiceHint so TTS uses the exact id the user picked.
        const withVoice: Script = enriched.voice
          ? { ...validated, ttsVoiceHint: enriched.voice }
          : validated;

        yield* Effect.logInfo("script generated", {
          title: withVoice.title,
          segments: withVoice.segments.length,
          totalDuration: withVoice.totalDuration,
          ttsVoiceHint: withVoice.ttsVoiceHint,
        });

        return withVoice;
      });

    return { generate } as const;
  }),
  dependencies: [LLMService.Default],
}) {}
