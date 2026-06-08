/**
 * Server Actions — the boundary between React (client) and Effect (server).
 *
 * All actions go through `runtime.runPromise` so errors are typed.
 */

"use server";

import { Effect, Exit } from "effect";
import { Schema } from "effect";
import { runtime } from "./runtime";
import { BriefInput } from "@/domain/script/schema";
import { JobService } from "@/domain/jobs/service";
import { LLMError, FileSystemError, ValidationError } from "@/domain/lib/errors";

export interface CreateBriefInput {
  storyType: string;
  theme: string;
  lengthMinutes: number;
  aspectRatio?: string;
  lang?: string;
  voice?: string;
  styleAnchor?: string;
}

export async function createBrief(input: CreateBriefInput) {
  const program = Effect.gen(function* () {
    const jobSvc = yield* JobService;

    // Validate input with Schema
    const decodeResult = yield* Effect.either(Schema.decodeUnknown(BriefInput)(input as unknown));
    if (decodeResult._tag === "Left") {
      return {
        ok: false as const,
        error: `Invalid input: ${decodeResult.left.message}`,
      };
    }
    const parsed = decodeResult.right;

    const result = yield* jobSvc.createBrief(parsed);
    return { ok: true as const, jobId: result.jobId, jobDir: result.jobDir };
  });

  const exit = await runtime.runPromiseExit(
    program as Effect.Effect<
      { ok: true; jobId: string; jobDir: string } | { ok: false; error: string },
      string | LLMError | ValidationError | FileSystemError,
      JobService
    >,
  );

  if (Exit.isSuccess(exit)) {
    return exit.value as
      | { ok: true; jobId: string; jobDir: string }
      | { ok: false; error: string; field?: string };
  } else {
    const failure = exit.cause;
    if (failure._tag === "Fail") {
      const err = failure.error as { message?: string; _tag?: string; field?: string };
      return {
        ok: false as const,
        error: err.message ?? "Unknown error",
        field: err.field,
      };
    }
    return {
      ok: false as const,
      error: "An unexpected error occurred",
    };
  }
}
