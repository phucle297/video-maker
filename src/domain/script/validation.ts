/**
 * Cross-field validation for Script.
 * Runs AFTER schema decode; uses Effect.fail with typed errors.
 */

import { Effect } from "effect";
import type { Script } from "./schema.js";
import { ValidationError } from "../lib/errors.js";

/** totalDuration should be within 30% of (lengthMinutes * 60). */
export const validateTotalDuration = (
  script: Script,
  lengthMinutes: number,
): Effect.Effect<void, ValidationError> => {
  const target = lengthMinutes * 60;
  const actual = script.totalDuration;
  if (Math.abs(actual - target) / target > 0.3) {
    return Effect.fail(
      new ValidationError({
        message: `totalDuration ${actual}s is more than 30% off from target ${target}s`,
        field: "totalDuration",
      }),
    );
  }
  return Effect.void;
};

/** Segments should be sequential and well-formed. */
export const validateSegments = (script: Script): Effect.Effect<void, ValidationError> => {
  for (let i = 0; i < script.segments.length; i++) {
    const seg = script.segments[i];
    const expected = `seg-${String(i + 1).padStart(3, "0")}`;
    if (seg.id !== expected) {
      return Effect.fail(
        new ValidationError({
          message: `segment ${i} has id ${seg.id}, expected ${expected}`,
          field: `segments[${i}].id`,
        }),
      );
    }

    // Check callout timing
    for (const co of seg.callouts) {
      if (co.endFraction <= co.startFraction) {
        return Effect.fail(
          new ValidationError({
            message: `segment ${seg.id}: callout "${co.text}" has end <= start`,
            field: `segments[${i}].callouts`,
          }),
        );
      }
    }
  }
  return Effect.void;
};

/** All segments should match the script's aspect ratio. */
export const validateAspectRatio = (script: Script): Effect.Effect<void, ValidationError> => {
  for (let i = 0; i < script.segments.length; i++) {
    const seg = script.segments[i];
    if (seg.visual.aspectRatio !== script.aspectRatio) {
      return Effect.fail(
        new ValidationError({
          message: `segment ${seg.id}: visual.aspectRatio (${seg.visual.aspectRatio}) doesn't match script.aspectRatio (${script.aspectRatio})`,
          field: `segments[${i}].visual.aspectRatio`,
        }),
      );
    }
  }
  return Effect.void;
};

export const validateScript = (
  script: Script,
  lengthMinutes: number,
): Effect.Effect<Script, ValidationError> =>
  Effect.gen(function* () {
    yield* validateTotalDuration(script, lengthMinutes);
    yield* validateSegments(script);
    yield* validateAspectRatio(script);
    return script;
  });
