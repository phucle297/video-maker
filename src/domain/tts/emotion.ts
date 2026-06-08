/**
 * Mood → TTS emotion mapping.
 * The MiniMax TTS API takes a small set of named emotions; we map our
 * broader mood vocabulary to it.
 */

const MOOD_TO_EMOTION: Record<string, string> = {
  eerie: "fearful",
  creepy: "fearful",
  tense: "angry",
  anxious: "fearful",
  sad: "sad",
  calm: "neutral",
  neutral: "neutral",
  dreamy: "neutral",
  peaceful: "happy",
  joyful: "happy",
  ominous: "angry",
  mysterious: "neutral",
  dramatic: "surprised",
  surprised: "surprised",
  warm: "happy",
  cold: "neutral",
};

export function emotionForMood(mood: string, fallback: string): string {
  return MOOD_TO_EMOTION[mood.toLowerCase()] ?? fallback;
}
