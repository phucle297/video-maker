/**
 * GET /api/jobs/[jobId]/final — stream the final.mp4 file.
 */

import { promises as fs } from "node:fs";
import { createReadStream, statSync } from "node:fs";
import { Effect, Exit } from "effect";
import { runtime as effectRuntime } from "@/lib/runtime";
import { JobService } from "@/domain/jobs/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const program = Effect.gen(function* () {
    const jobSvc = yield* JobService;
    return yield* jobSvc.getStatus(jobId);
  });

  const exit = await effectRuntime.runPromiseExit(program);
  if (Exit.isFailure(exit)) {
    return new Response("Job not found", { status: 404 });
  }
  const job = exit.value;
  const finalPath = job.finalPath;

  try {
    const stat = statSync(finalPath);
    const stream = createReadStream(finalPath);
    // Convert Node Readable → Web ReadableStream
    // @ts-expect-error: Bun/Node interop
    return new Response(stream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename="final-${jobId}.mp4"`,
      },
    });
  } catch {
    return new Response("final.mp4 not found", { status: 404 });
  }
}
