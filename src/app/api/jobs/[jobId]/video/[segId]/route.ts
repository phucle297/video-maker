/**
 * PUT /api/jobs/[jobId]/video/[segId] — upload a video file for a segment.
 *
 * Multipart form-data with a single "file" field.
 */

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Effect, Exit } from "effect";
import { runtime } from "@/lib/runtime";
import { JobService, videoPath } from "@/domain/jobs/service";

export const dynamic = "force-dynamic";
export const runtime2 = "nodejs";

export async function PUT(req: Request, { params }: { params: Promise<{ jobId: string; segId: string }> }) {
  const { jobId, segId } = await params;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const program = Effect.gen(function* () {
    const jobSvc = yield* JobService;
    const job = yield* jobSvc.getStatus(jobId);
    const seg = job.script.segments.find((s) => s.id === segId);
    if (!seg) {
      return yield* Effect.fail(new Error(`segment ${segId} not in script`));
    }
    const p = videoPath(job.jobDir, segId);
    yield* Effect.tryPromise({
      try: async () => {
        await fs.mkdir(path.dirname(p), { recursive: true });
        const buf = Buffer.from(await file.arrayBuffer());
        await fs.writeFile(p, buf);
        return buf.length;
      },
      catch: (e) => new Error(`upload failed: ${e instanceof Error ? e.message : String(e)}`),
    });
  });

  const exit = await runtime.runPromiseExit(program);
  if (Exit.isSuccess(exit)) {
    return NextResponse.json({ ok: true });
  }
  const failure = exit.cause;
  if (failure._tag === "Fail") {
    const err = failure.error as { message?: string };
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
  return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
}
