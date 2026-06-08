/**
 * GET /api/jobs/[jobId]/prompts — returns the rendered prompts.md as plain text.
 */

import { Effect, Exit } from "effect";
import { runtime } from "@/lib/runtime";
import { JobService, promptsPath } from "@/domain/jobs/service";
import { promises as fs } from "node:fs";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const program = Effect.gen(function* () {
    const jobSvc = yield* JobService;
    return yield* jobSvc.getStatus(jobId);
  });

  const exit = await runtime.runPromiseExit(program);
  if (Exit.isFailure(exit)) {
    return new Response("Job not found", { status: 404 });
  }
  const job = exit.value;
  const p = promptsPath(job.jobDir);

  try {
    const md = await fs.readFile(p, "utf-8");
    return new Response(md, {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  } catch {
    return new Response("prompts.md not found", { status: 404 });
  }
}
