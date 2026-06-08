/**
 * MiniMax TTS HTTP client (Effect Service).
 *
 * Returns a Uint8Array of MP3 bytes; the TtsService handles writing to disk.
 */

import { Config, Effect, Layer } from "effect";
import {
  MiniMaxApiKey,
  MiniMaxDefaultEmotion,
  MiniMaxDefaultSpeed,
  MiniMaxTtsModel,
  MiniMaxTtsUrl,
  MiniMaxVoiceId,
} from "../lib/config.js";
import { TtsError } from "../lib/errors.js";
import { TtsRetry } from "../lib/retry.js";

export interface TtsRequest {
  text: string;
  voiceId?: string;
  emotion?: string;
  speed?: number;
}

export class MiniMaxTtsClient extends Effect.Service<MiniMaxTtsClient>()("app/MiniMaxTtsClient", {
  effect: Effect.gen(function* () {
    const apiKey = yield* MiniMaxApiKey;
    const baseUrl = yield* MiniMaxTtsUrl;
    const model = yield* MiniMaxTtsModel;
    const defaultVoice = yield* MiniMaxVoiceId;
    const defaultEmotion = yield* MiniMaxDefaultEmotion;
    const defaultSpeed = yield* MiniMaxDefaultSpeed;

    const synthesize = (req: TtsRequest) =>
      Effect.gen(function* () {
        const body = JSON.stringify({
          model,
          text: req.text,
          voice_id: req.voiceId ?? defaultVoice,
          emotion: req.emotion ?? defaultEmotion,
          speed: req.speed ?? defaultSpeed,
          output_format: "mp3",
          sample_rate: 24000,
        });

        const response = yield* Effect.tryPromise({
          try: () =>
            fetch(baseUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body,
            }),
          catch: (e) => new TtsError({ message: "TTS fetch failed", cause: e }),
        });

        if (response.status === 429 || response.status >= 500) {
          return yield* Effect.fail(
            new TtsError({ message: `TTS transient ${response.status}`, status: response.status }),
          );
        }

        if (!response.ok) {
          const errorText = yield* Effect.tryPromise({
            try: () => response.text(),
            catch: () => "could not read error body",
          }).pipe(Effect.orElseSucceed(() => "could not read error body"));
          return yield* Effect.fail(
            new TtsError({
              message: `TTS ${response.status}: ${errorText.slice(0, 200)}`,
              status: response.status,
            }),
          );
        }

        const buffer = yield* Effect.tryPromise({
          try: () => response.arrayBuffer(),
          catch: (e) => new TtsError({ message: "TTS: failed to read body", cause: e }),
        });

        return new Uint8Array(buffer);
      }).pipe(
        Effect.retry(TtsRetry),
        Effect.timeout("60 seconds"),
        Effect.tapError((e) => Effect.logError("TTS failed", e)),
      );

    return { synthesize } as const;
  }),
}) {}
