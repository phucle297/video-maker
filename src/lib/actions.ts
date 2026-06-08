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

export interface CreateBriefInput {
  storyType: string;
  theme: string;
  lengthMinutes: number;
  aspectRatio?: string;
  lang?: string;
  voice?: string;
  styleAnchor?: string;
}

export interface CreateBriefResultOk {
  ok: true;
  jobId: string;
  jobDir: string;
}

export interface CreateBriefResultErr {
  ok: false;
  error: string;
  field?: string;
}

export type CreateBriefResult = CreateBriefResultOk | CreateBriefResultErr;

export async function createBrief(input: CreateBriefInput): Promise<CreateBriefResult> {
  const program = Effect.gen(function* () {
    const jobSvc = yield* JobService;

    // Validate input with Schema
    const parsed = yield* Schema.decodeUnknown(BriefInput)(input).pipe(
      Effect.mapError((e) => ({
        ok: false as const,
        error: `Invalid input: ${e.message}`,
      })),
    );

    const result = yield* jobSvc.createBrief(parsed);
    return { ok: true as const, jobId: result.jobId, jobDir: result.jobDir };
  });

  const exit = await runtime.runPromiseExit(program);

  if (Exit.isSuccess(exit)) {
    return exit.value;
  } else {
    const failure = exit.cause;
    if (failure._tag === "Fail") {
      const err = failure.error as { message?: string; _tag?: string; field?: string };
      return {
        ok: false,
        error: err.message ?? "Unknown error",
        field: err.field,
      };
    }
    return {
      ok: false,
      error: "An unexpected error occurred",
    };
  }
}
