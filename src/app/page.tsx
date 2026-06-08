/**
 * Home page — list all jobs.
 * Server component: reads from JobService at request time.
 */

import Link from "next/link";
import { Effect, Exit } from "effect";
import { runtime } from "@/lib/runtime";
import { JobService } from "@/domain/jobs/service";
import { formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

interface JobSummary {
  jobId: string;
  title: string;
  storyType: string;
  totalDuration: number;
  segments: number;
  finalExists: boolean;
}

async function loadJobs(): Promise<JobSummary[]> {
  const program = Effect.gen(function* () {
    const jobSvc = yield* JobService;
    const jobIds = yield* jobSvc.listJobs();
    const summaries: JobSummary[] = [];
    for (const jobId of jobIds) {
      const status = yield* jobSvc.getStatus(jobId).pipe(Effect.orElseSucceed(() => null));
      if (status) {
        summaries.push({
          jobId,
          title: status.script.title,
          storyType: status.script.storyType,
          totalDuration: status.script.totalDuration,
          segments: status.script.segments.length,
          finalExists: status.finalExists,
        });
      }
    }
    return summaries;
  });

  const exit = await runtime.runPromiseExit(program);
  if (Exit.isSuccess(exit)) return exit.value;
  return [];
}

export default async function HomePage() {
  const jobs = await loadJobs();

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.6rem" }}>Your Jobs</h1>
        <span className="faint">{jobs.length} total</span>
      </div>

      {jobs.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
          <p className="muted" style={{ marginBottom: "1rem" }}>
            No jobs yet.
          </p>
          <Link href="/new" className="btn">
            Create your first brief
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "1rem",
          }}
        >
          {jobs.map((job) => (
            <Link
              key={job.jobId}
              href={`/jobs/${job.jobId}`}
              className="card"
              style={{ display: "block", textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "start",
                  marginBottom: "0.5rem",
                }}
              >
                <h3 style={{ fontSize: "1.05rem", lineHeight: 1.3 }}>{job.title}</h3>
                {job.finalExists && <span className="badge badge-success">done</span>}
              </div>
              <div
                className="muted"
                style={{ fontSize: "0.85rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}
              >
                <span className="badge badge-accent">{job.storyType}</span>
                <span>{job.segments} segments</span>
                <span>~{formatDuration(job.totalDuration)}</span>
              </div>
              <div className="faint" style={{ fontSize: "0.78rem", marginTop: "0.75rem" }}>
                {job.jobId}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
