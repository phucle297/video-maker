/**
 * MiniMax TTS HTTP client (Effect Service).
 *
 * Endpoint: POST /v1/t2a_v2
 * Request:  nested { model, text, stream, voice_setting, audio_setting, ... }
 * Response: JSON { data: { audio: "<hex>", status }, extra_info, base_resp, trace_id }
 *
 * Returns a Uint8Array of MP3 bytes; the TtsService handles writing to disk.
 */

import { Effect, Redacted, Schema } from "effect";
import {
  MiniMaxApiKey,
  MiniMaxDefaultSpeed,
  MiniMaxTtsModel,
  MiniMaxTtsUrl,
  MiniMaxVoiceId,
} from "../lib/config";
import { TtsError } from "../lib/errors";
import { TtsRetry } from "../lib/retry";

// ---------- response schema (defensive decode) ----------

const TtsBaseResp = Schema.Struct({
  status_code: Schema.Number,
  status_msg: Schema.optional(Schema.String),
});

const TtsData = Schema.Struct({
  audio: Schema.String,
  status: Schema.optional(Schema.Number),
});

const TtsExtraInfo = Schema.Struct({
  audio_length: Schema.optional(Schema.Number),
  audio_sample_rate: Schema.optional(Schema.Number),
  audio_size: Schema.optional(Schema.Number),
  audio_format: Schema.optional(Schema.String),
  audio_channel: Schema.optional(Schema.Number),
  usage_characters: Schema.optional(Schema.Number),
});

const TtsResponse = Schema.Struct({
  data: TtsData,
  extra_info: Schema.optional(TtsExtraInfo),
  trace_id: Schema.optional(Schema.String),
  base_resp: TtsBaseResp,
});

// ---------- request/response types ----------

export interface TtsRequest {
  text: string;
  voiceId?: string;
  /** Kept for back-compat; T2A v2 has no top-level emotion field. */
  emotion?: string;
  speed?: number;
}

export class MiniMaxTtsClient extends Effect.Service<MiniMaxTtsClient>()("app/MiniMaxTtsClient", {
  effect: Effect.gen(function* () {
    const apiKey = Redacted.value(yield* MiniMaxApiKey);
    const baseUrl = yield* MiniMaxTtsUrl;
    const model = yield* MiniMaxTtsModel;
    const defaultVoice = yield* MiniMaxVoiceId;
    const defaultSpeed = yield* MiniMaxDefaultSpeed;

    const synthesize = (req: TtsRequest) =>
      Effect.gen(function* () {
        const body = JSON.stringify({
          model,
          text: req.text,
          stream: false,
          voice_setting: {
            voice_id: req.voiceId ?? defaultVoice,
            speed: req.speed ?? defaultSpeed,
            vol: 1,
            pitch: 0,
          },
          audio_setting: {
            sample_rate: 24000,
            bitrate: 128000,
            format: "mp3",
            channel: 1,
          },
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
          });
          return yield* Effect.fail(
            new TtsError({
              message: `TTS ${response.status}: ${errorText.slice(0, 200)}`,
              status: response.status,
            }),
          );
        }

        const responseJson = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: (e) => new TtsError({ message: "TTS: failed to parse JSON response", cause: e }),
        });

        const parsed = yield* Schema.decodeUnknown(TtsResponse)(responseJson).pipe(
          Effect.mapError(
            (e) =>
              new TtsError({
                message: `TTS response shape mismatch: ${e.message}`,
                cause: e,
              }),
          ),
        );

        if (parsed.base_resp.status_code !== 0) {
          return yield* Effect.fail(
            new TtsError({
              message: `TTS api error ${parsed.base_resp.status_code}: ${parsed.base_resp.status_msg ?? "unknown"}`,
            }),
          );
        }

        const hex = parsed.data.audio;
        if (typeof hex !== "string" || hex.length === 0) {
          return yield* Effect.fail(new TtsError({ message: "TTS response missing data.audio" }));
        }

        return new Uint8Array(Buffer.from(hex, "hex"));
      }).pipe(
        Effect.retry(TtsRetry),
        Effect.timeout("60 seconds"),
        Effect.tapError((e) => Effect.logError("TTS failed", e)),
      );

    return { synthesize } as const;
  }),
}) {}
