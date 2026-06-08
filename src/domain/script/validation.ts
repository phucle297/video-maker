/**
 * Cross-field validation for Script.
 * Pure sync checks — throws ValidationError on failure.
 * Caller wraps with Effect.try.
 */

import type { Script } from "./schema";
import { ValidationError } from "../lib/errors";

/** totalDuration should be within 30% of (lengthMinutes * 60). */
export const validateTotalDuration = (script: Script, lengthMinutes: number): void => {
  const target = lengthMinutes * 60;
  const actual = script.totalDuration;
  if (Math.abs(actual - target) / target > 0.3) {
    throw new ValidationError({
      message: `totalDuration ${actual}s is more than 30% off from target ${target}s`,
      field: "totalDuration",
    });
  }
};

/** Segments should be sequential and well-formed. */
export const validateSegments = (script: Script): void => {
  for (let i = 0; i < script.segments.length; i++) {
    const seg = script.segments[i]!;
    const expected = `seg-${String(i + 1).padStart(3, "0")}`;
    if (seg.id !== expected) {
      throw new ValidationError({
        message: `segment ${i} has id ${seg.id}, expected ${expected}`,
        field: `segments[${i}].id`,
      });
    }

    // Check callout timing
    for (const co of seg.callouts) {
      if (co.endFraction <= co.startFraction) {
        throw new ValidationError({
          message: `segment ${seg.id}: callout "${co.text}" has end <= start`,
          field: `segments[${i}].callouts`,
        });
      }
    }
  }
};

/** All segments should match the script's aspect ratio. */
export const validateAspectRatio = (script: Script): void => {
  for (let i = 0; i < script.segments.length; i++) {
    const seg = script.segments[i]!;
    if (seg.visual.aspectRatio !== script.aspectRatio) {
      throw new ValidationError({
        message: `segment ${seg.id}: visual.aspectRatio (${seg.visual.aspectRatio}) doesn't match script.aspectRatio (${script.aspectRatio})`,
        field: `segments[${i}].visual.aspectRatio`,
      });
    }
  }
};

// TODO caller wraps — service.ts must use Effect.try({ try: () => validateScript(...), catch: ... })
export const validateScript = (script: Script, lengthMinutes: number): Script => {
  validateTotalDuration(script, lengthMinutes);
  validateSegments(script);
  validateAspectRatio(script);
  return script;
};
