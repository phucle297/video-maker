/**
 * Effect Config — typed environment variable access.
 * Used by services that need env values. Errors are typed, not strings.
 */

import { Config } from "effect";

export const MiniMaxApiKey = Config.redacted("MINIMAX_API_KEY");
export const MiniMaxLlmUrl = Config.string("MINIMAX_LLM_URL").pipe(
  Config.withDefault("https://api.MiniMax.chat/v1"),
);
export const MiniMaxLlmModel = Config.string("MINIMAX_LLM_MODEL").pipe(
  Config.withDefault("MiniMax-Text-01"),
);
export const MiniMaxLlmTemperature = Config.number("MINIMAX_LLM_TEMPERATURE").pipe(
  Config.withDefault(0.8),
);

export const MiniMaxTtsUrl = Config.string("MINIMAX_TTS_URL").pipe(
  Config.withDefault("https://api.MiniMax.io/v1/tts"),
);
export const MiniMaxTtsModel = Config.string("MINIMAX_TTS_MODEL").pipe(
  Config.withDefault("speech-2.6-hd"),
);
export const MiniMaxVoiceId = Config.string("MINIMAX_VOICE_ID").pipe(
  Config.withDefault("male-qn-jingying"),
);
export const MiniMaxDefaultEmotion = Config.string("MINIMAX_DEFAULT_EMOTION").pipe(
  Config.withDefault("neutral"),
);
export const MiniMaxDefaultSpeed = Config.number("MINIMAX_DEFAULT_SPEED").pipe(
  Config.withDefault(0.95),
);

export const PipelineConcurrency = Config.number("PIPELINE_CONCURRENCY").pipe(
  Config.withDefault(3),
);
export const OutputDir = Config.string("OUTPUT_DIR").pipe(Config.withDefault("./outputs"));
export const DefaultLang = Config.string("DEFAULT_LANG").pipe(Config.withDefault("vi"));
export const DefaultAspect = Config.string("DEFAULT_ASPECT").pipe(Config.withDefault("9:16"));
