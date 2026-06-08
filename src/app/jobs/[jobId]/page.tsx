/**
 * Job detail page — server component shell.
 * Renders tabs: Script | Prompts | Videos | Render
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { Effect, Exit } from "effect";
import { runtime } from "@/lib/runtime";
import { JobService } from "@/domain/jobs/service";
import { formatDuration } from "@/lib/format";
import { JobTabs } from "@/components/job-tabs";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ jobId: string }>;
}

async function loadJob(jobId: string) {
  const program = Effect.gen(function* () {
    const jobSvc = yield* JobService;
    return yield* jobSvc.getStatus(jobId);
  });

  const exit = await runtime.runPromiseExit(program);
  if (Exit.isFailure(exit)) return null;
  return exit.value;
}

export default async function JobPage({ params }: PageProps) {
  const { jobId } = await params;
  const status = await loadJob(jobId);
  if (!status) notFound();

  const uploadedCount = status.videos.filter((v) => v.uploaded).length;
  const totalCount = status.videos.length;
  const allUploaded = uploadedCount === totalCount;

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/" className="faint" style={{ fontSize: "0.9rem" }}>
          ← All jobs
        </Link>
        <h1 style={{ fontSize: "1.6rem", marginTop: "0.5rem" }}>{status.script.title}</h1>
        <div className="muted" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
          <span className="badge badge-accent">{status.script.storyType}</span>
          <span className="badge">{status.script.lang}</span>
          <span className="badge">{status.script.aspectRatio}</span>
          <span className="badge">~{formatDuration(status.script.totalDuration)}</span>
          <span className="badge">
            {uploadedCount}/{totalCount} videos
          </span>
          {status.finalExists && <span className="badge badge-success">final.mp4</span>}
        </div>
      </div>

      <JobTabs
        jobId={jobId}
        script={status.script}
        videos={status.videos}
        allUploaded={allUploaded}
        finalExists={status.finalExists}
        finalPath={status.finalPath}
      />
    </div>
  );
}
