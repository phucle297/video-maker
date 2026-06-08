/**
 * Typed render event stream.
 *
 * The UI consumes these via SSE. Each event has a `type` discriminator
 * that the client uses to update the progress feed.
 */

import { Schema } from "effect";

export const RenderStarted = Schema.Struct({
  type: Schema.Literal("started"),
  jobId: Schema.String,
  totalSegments: Schema.Number,
});

export const RenderSegmentTts = Schema.Struct({
  type: Schema.Literal("tts"),
  segmentId: Schema.String,
  index: Schema.Number,
  status: Schema.Literal("start", "done", "error"),
  message: Schema.optional(Schema.String),
  durationSec: Schema.optional(Schema.Number),
});

export const RenderCompose = Schema.Struct({
  type: Schema.Literal("compose"),
  status: Schema.Literal("start", "pack-done", "pack-error", "done", "error"),
  message: Schema.optional(Schema.String),
  outPath: Schema.optional(Schema.String),
  durationSec: Schema.optional(Schema.Number),
  current: Schema.optional(Schema.Number),
  total: Schema.optional(Schema.Number),
});

export const RenderDone = Schema.Struct({
  type: Schema.Literal("done"),
  outPath: Schema.String,
  durationSec: Schema.Number,
});

export const RenderError = Schema.Struct({
  type: Schema.Literal("error"),
  message: Schema.String,
  fatal: Schema.Boolean,
});

export const RenderEvent = Schema.Union(
  RenderStarted,
  RenderSegmentTts,
  RenderCompose,
  RenderDone,
  RenderError,
);
export type RenderEvent = Schema.Schema.Type<typeof RenderEvent>;
