/**
 * GET /api/jobs/[jobId] — job status (videos uploaded, final exists, etc.)
 */

import { NextResponse } from "next/server";
import { Effect, Exit } from "effect";
import { runtime } from "@/lib/runtime";
import { JobService } from "@/domain/jobs/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const program = Effect.gen(function* () {
    const jobSvc = yield* JobService;
    return yield* jobSvc.getStatus(jobId);
  });

  const exit = await runtime.runPromiseExit(program);
  if (Exit.isSuccess(exit)) {
    return NextResponse.json(exit.value);
  }
  return NextResponse.json({ error: "Job not found" }, { status: 404 });
}
