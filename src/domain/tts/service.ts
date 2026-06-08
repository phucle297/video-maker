/**
 * TtsService — synthesize a Segment's narration to an MP3 file on disk.
 *
 * Uses Effect.forEach with concurrency for parallel per-segment synthesis.
 * Caches results to avoid re-synthesizing on re-render.
 */

import { Effect, Stream } from "effect";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MiniMaxTtsClient } from "./client";
import { emotionForMood } from "./emotion";
import { PipelineConcurrency, MiniMaxVoiceId, MiniMaxDefaultEmotion } from "../lib/config";
import { FileSystemError, TtsError } from "../lib/errors";
import type { Segment } from "../script/schema";

export type TtsEvent = {
  type: "tts";
  segmentId: string;
  index: number;
  status: "start" | "done" | "error" | "cached";
  path?: string;
  message?: string;
};

export class TtsService extends Effect.Service<TtsService>()("app/TtsService", {
  effect: Effect.gen(function* () {
    const client = yield* MiniMaxTtsClient;
    const concurrency = yield* PipelineConcurrency;
    const defaultVoice = yield* MiniMaxVoiceId;
    const defaultEmotion = yield* MiniMaxDefaultEmotion;

    const synthesizeSegment = (seg: Segment, outPath: string, voiceOverride?: string) =>
      Effect.gen(function* () {
        // Cache hit
        const stat = yield* Effect.tryPromise({
          try: () => fs.stat(outPath),
          catch: () => undefined,
        }).pipe(Effect.orElseSucceed(() => undefined));
        if (stat && stat.size > 1000) {
          yield* Effect.logDebug("TTS cache hit", { seg: seg.id, size: stat.size });
          return outPath;
        }

        yield* Effect.tryPromise({
          try: () => fs.mkdir(path.dirname(outPath), { recursive: true }),
          catch: (e) =>
            new FileSystemError({ message: "mkdir failed", path: path.dirname(outPath), cause: e }),
        });

        const voiceId = voiceOverride ?? defaultVoice;
        const emotion = emotionForMood(seg.visual.mood, defaultEmotion);
        const audio = yield* client.synthesize({
          text: seg.text,
          voiceId,
          emotion,
        });

        yield* Effect.tryPromise({
          try: () => fs.writeFile(outPath, audio),
          catch: (e) => new FileSystemError({ message: "write failed", path: outPath, cause: e }),
        });

        yield* Effect.logInfo("TTS ok", { seg: seg.id, bytes: audio.length, emotion, voiceId });
        return outPath;
      });

    const synthesizeAll = (
      segments: readonly Segment[],
      outDir: string,
      voiceOverride?: string,
    ) =>
      Effect.gen(function* () {
        yield* Effect.logInfo("TTS: synthesizing all", {
          count: segments.length,
          concurrency,
          voiceOverride: voiceOverride ?? defaultVoice,
        });

        yield* Effect.tryPromise({
          try: () => fs.mkdir(outDir, { recursive: true }),
          catch: (e) => new FileSystemError({ message: "mkdir failed", path: outDir, cause: e }),
        });

        yield* Effect.forEach(
          segments,
          (seg) =>
            synthesizeSegment(seg, path.join(outDir, `${seg.id}.mp3`), voiceOverride).pipe(
              Effect.tapError((e) => Effect.logError(`TTS failed for ${seg.id}`, e)),
            ),
          { concurrency, discard: true },
        );

        return outDir;
      });

    const synthesizeAllStream = (
      segments: readonly Segment[],
      outDir: string,
      voiceOverride?: string,
      concurrencyOverride: number = concurrency,
    ): Stream.Stream<TtsEvent, FileSystemError | TtsError> => {
      const ensureDir = Effect.tryPromise({
        try: () => fs.mkdir(outDir, { recursive: true }),
        catch: (e) => new FileSystemError({ message: "mkdir failed", path: outDir, cause: e }),
      });
      return Stream.fromEffect(
        Effect.gen(function* () {
          yield* Effect.logInfo("TTS: synthesizing all (stream)", {
            count: segments.length,
            concurrency: concurrencyOverride,
            voiceOverride: voiceOverride ?? defaultVoice,
          });
          yield* ensureDir;
        }),
      ).pipe(
        Stream.flatMap(() =>
          Stream.fromIterable(segments).pipe(
            Stream.zipWithIndex,
            Stream.mapEffect(
              ([seg, i]) =>
                Effect.gen(function* () {
                  const events: TtsEvent[] = [
                    { type: "tts", segmentId: seg.id, index: i, status: "start" },
                  ];
                  const segPath = yield* synthesizeSegment(
                    seg,
                    path.join(outDir, `${seg.id}.mp3`),
                    voiceOverride,
                  );
                  events.push({
                    type: "tts",
                    segmentId: seg.id,
                    index: i,
                    status: "done",
                    path: segPath,
                  });
                  return events;
                }).pipe(
                  Effect.catchAll(
                    (e): Effect.Effect<TtsEvent[]> =>
                      Effect.succeed([
                        {
                          type: "tts",
                          segmentId: seg.id,
                          index: i,
                          status: "error",
                          message: e instanceof Error ? e.message : String(e),
                        },
                      ]),
                  ),
                ),
              { concurrency: concurrencyOverride },
            ),
            Stream.flatMap((events) => Stream.fromIterable(events)),
          ),
        ),
      );
    };

    return { synthesizeAll, synthesizeAllStream } as const;
  }),
  dependencies: [MiniMaxTtsClient.Default],
}) {}
