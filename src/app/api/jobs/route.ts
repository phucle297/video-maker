/**
 * GET /api/jobs — list all jobs
 * POST /api/jobs — create a brief (alternative to the Server Action)
 */

import { NextResponse } from "next/server";
import { Effect, Exit } from "effect";
import { Schema } from "effect";
import { runtime } from "@/lib/runtime";
import { JobService } from "@/domain/jobs/service";
import { BriefInput } from "@/domain/script/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const program = Effect.gen(function* () {
    const jobSvc = yield* JobService;
    return yield* jobSvc.listJobs();
  });

  const exit = await runtime.runPromiseExit(program);
  if (Exit.isSuccess(exit)) {
    return NextResponse.json({ jobs: exit.value });
  }
  return NextResponse.json({ error: "Failed to list jobs" }, { status: 500 });
}

export async function POST(req: Request) {
  const body = (await req.json()) as unknown;

  const program = Effect.gen(function* () {
    const jobSvc = yield* JobService;
    const parsed = yield* Schema.decodeUnknown(BriefInput)(body).pipe(
      Effect.mapError((e) => ({ message: `Invalid input: ${e.message}` })),
    );
    return yield* jobSvc.createBrief(parsed);
  });

  const exit = await runtime.runPromiseExit(program);
  if (Exit.isSuccess(exit)) {
    return NextResponse.json({
      ok: true,
      jobId: exit.value.jobId,
      jobDir: exit.value.jobDir,
    });
  }
  const failure = exit.cause;
  if (failure._tag === "Fail") {
    const err = failure.error as { message?: string; _tag?: string };
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
  return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
}
