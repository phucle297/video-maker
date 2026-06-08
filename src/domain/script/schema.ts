/**
 * Effect Schema for the Script domain object.
 *
 * Same Schema used for:
 *   1. Runtime validation of LLM output
 *   2. Static TypeScript types (via Schema.Type)
 *   3. Server Action input validation
 */

import { Schema } from "effect";

// ---------- enums ----------

export const StoryType = Schema.Literal("nosleep", "creepypasta", "mystic", "rules", "imagine");
export type StoryType = Schema.Schema.Type<typeof StoryType>;

export const AspectRatio = Schema.Literal("9:16", "16:9", "1:1");
export type AspectRatio = Schema.Schema.Type<typeof AspectRatio>;

export const CalloutAnchor = Schema.Literal("top", "middle", "lower");
export type CalloutAnchor = Schema.Schema.Type<typeof CalloutAnchor>;

export const CalloutStyle = Schema.Literal("pop", "fade", "slide-up");
export type CalloutStyle = Schema.Schema.Type<typeof CalloutStyle>;

export const CalloutEmphasis = Schema.Literal("normal", "strong");
export type CalloutEmphasis = Schema.Schema.Type<typeof CalloutEmphasis>;

export const Lang = Schema.Literal("vi", "en");
export type Lang = Schema.Schema.Type<typeof Lang>;

// ---------- callout ----------

export const Callout = Schema.Struct({
  text: Schema.String.pipe(Schema.minLength(2), Schema.maxLength(80)),
  startFraction: Schema.Number.pipe(Schema.between(0, 1)),
  endFraction: Schema.Number.pipe(Schema.between(0, 1)),
  anchor: CalloutAnchor,
  style: CalloutStyle,
  emphasis: CalloutEmphasis,
});
export type Callout = Schema.Schema.Type<typeof Callout>;

// ---------- visual cue ----------

export const VisualCue = Schema.Struct({
  prompt: Schema.String.pipe(Schema.minLength(20)),
  mood: Schema.String.pipe(Schema.minLength(2)),
  styleAnchor: Schema.optional(Schema.String),
  durationHint: Schema.Number.pipe(Schema.between(2, 8)),
  aspectRatio: AspectRatio,
  notesForHuman: Schema.optional(Schema.String),
});
export type VisualCue = Schema.Schema.Type<typeof VisualCue>;

// ---------- segment ----------

export const Segment = Schema.Struct({
  id: Schema.String.pipe(Schema.pattern(/^seg-\d{3}$/)),
  text: Schema.String.pipe(Schema.minLength(10)),
  approxDuration: Schema.Number.pipe(Schema.between(2, 20)),
  visual: VisualCue,
  callouts: Schema.Array(Callout).pipe(Schema.maxLength(3)),
});
export type Segment = Schema.Schema.Type<typeof Segment>;

// ---------- script (root) ----------

export const Script = Schema.Struct({
  title: Schema.String.pipe(Schema.minLength(3), Schema.maxLength(120)),
  storyType: StoryType,
  lang: Lang,
  aspectRatio: AspectRatio,
  hook: Schema.String.pipe(Schema.minLength(10)),
  styleAnchor: Schema.String.pipe(Schema.minLength(10)),
  ttsVoiceHint: Schema.optional(Schema.String),
  totalDuration: Schema.Number.pipe(Schema.between(15, 600)),
  segments: Schema.Array(Segment).pipe(Schema.minLength(3), Schema.maxLength(20)),
});
export type Script = Schema.Schema.Type<typeof Script>;

// ---------- brief input (user → server) ----------

export const BriefInput = Schema.Struct({
  storyType: StoryType,
  theme: Schema.String.pipe(Schema.minLength(3)),
  lengthMinutes: Schema.Number.pipe(Schema.between(0.5, 15)),
  aspectRatio: Schema.optional(AspectRatio),
  lang: Schema.optional(Lang),
  voice: Schema.optional(Schema.String),
  styleAnchor: Schema.optional(Schema.String),
});
export type BriefInput = Schema.Schema.Type<typeof BriefInput>;
