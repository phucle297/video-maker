/**
 * TtsService — synthesize a Segment's narration to an MP3 file on disk.
 *
 * Uses Effect.forEach with concurrency for parallel per-segment synthesis.
 * Caches results to avoid re-synthesizing on re-render.
 */

import { Config, Effect, Layer } from "effect";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MiniMaxTtsClient } from "./client.js";
import { emotionForMood } from "./emotion.js";
import { PipelineConcurrency, MiniMaxVoiceId, MiniMaxDefaultEmotion } from "../lib/config.js";
import { FileSystemError, TtsError } from "../lib/errors.js";
import type { Segment } from "../script/schema.js";

export class TtsService extends Effect.Service<TtsService>()("app/TtsService", {
  effect: Effect.gen(function* () {
    const client = yield* MiniMaxTtsClient;
    const concurrency = yield* PipelineConcurrency;
    const defaultVoice = yield* MiniMaxVoiceId;
    const defaultEmotion = yield* MiniMaxDefaultEmotion;

    const synthesizeSegment = (seg: Segment, outPath: string) =>
      Effect.gen(function* () {
        // Cache hit
        try {
          const stat = yield* Effect.tryPromise({
            try: () => fs.stat(outPath),
            catch: () => new FileSystemError({ message: "stat failed", path: outPath }),
          });
          if (stat.size > 1000) {
            yield* Effect.logDebug("TTS cache hit", { seg: seg.id, size: stat.size });
            return outPath;
          }
        } catch {
          // file doesn't exist — synthesize
        }

        yield* Effect.tryPromise({
          try: () => fs.mkdir(path.dirname(outPath), { recursive: true }),
          catch: (e) =>
            new FileSystemError({ message: "mkdir failed", path: path.dirname(outPath), cause: e }),
        });

        const emotion = emotionForMood(seg.visual.mood, defaultEmotion);
        const audio = yield* client.synthesize({
          text: seg.text,
          voiceId: defaultVoice,
          emotion,
        });

        yield* Effect.tryPromise({
          try: () => fs.writeFile(outPath, audio),
          catch: (e) => new FileSystemError({ message: "write failed", path: outPath, cause: e }),
        });

        yield* Effect.logInfo("TTS ok", { seg: seg.id, bytes: audio.length, emotion });
        return outPath;
      });

    const synthesizeAll = (segments: readonly Segment[], outDir: string) =>
      Effect.gen(function* () {
        yield* Effect.logInfo("TTS: synthesizing all", {
          count: segments.length,
          concurrency,
        });

        yield* Effect.tryPromise({
          try: () => fs.mkdir(outDir, { recursive: true }),
          catch: (e) => new FileSystemError({ message: "mkdir failed", path: outDir, cause: e }),
        });

        yield* Effect.forEach(
          segments,
          (seg) =>
            synthesizeSegment(seg, path.join(outDir, `${seg.id}.mp3`)).pipe(
              Effect.tapError((e) => Effect.logError(`TTS failed for ${seg.id}`, e)),
            ),
          { concurrency, discard: true },
        );

        return outDir;
      });

    return { synthesizeSegment, synthesizeAll } as const;
  }),
  dependencies: [MiniMaxTtsClient.Default],
}) {}
