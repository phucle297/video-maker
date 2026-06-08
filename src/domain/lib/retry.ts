/**
 * Reusable Schedule presets for retrying external calls.
 *
 * Effect 3.x's Schedule.exponential gives us:
 *   - exponential backoff
 *   - optional jitter
 *   - max delay cap
 *   - max attempts via Schedule.recurs
 */

import { Schedule } from "effect";

/** Retry up to 3 times with exponential backoff (500ms → 8s, with jitter). */
export const DefaultRetry = Schedule.exponential("500 millis", 2).pipe(
  Schedule.jittered,
  Schedule.intersect(Schedule.recurs(3)),
  Schedule.compose(Schedule.elapsed),
);

/** Retry up to 5 times for LLM (longer because of cost asymmetry). */
export const LlmRetry = Schedule.exponential("1 second", 2).pipe(
  Schedule.jittered,
  Schedule.intersect(Schedule.recurs(5)),
  Schedule.compose(Schedule.elapsed),
);

/** Retry up to 4 times for TTS (rate limits common). */
export const TtsRetry = Schedule.exponential("800 millis", 2).pipe(
  Schedule.jittered,
  Schedule.intersect(Schedule.recurs(4)),
  Schedule.compose(Schedule.elapsed),
);
