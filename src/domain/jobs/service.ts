/**
 * JobService — top-level orchestration of brief, render, and status.
 *
 * Provides:
 *   - createBrief(input): runs LLM, writes job folder, returns jobId
 *   - renderJob(jobId): emits a Stream<RenderEvent> for the SSE route
 *   - listJobs(): list all job ids
 *   - getStatus(jobId): read job folder state
 */

import { Effect, Stream } from "effect";
import { BriefInput, Script, type Segment } from "../script/schema";
import { ScriptService } from "../script/service";
import { TtsService } from "../tts/service";
import { renderCalloutsAss, validateCallouts } from "../callouts/ass";
import { ComposeService } from "../compose/service";
import type { ComposeEvent } from "../compose/service";
import {
  JobStorage,
  scriptPath,
  videoPath,
  audioPath,
  calloutsPath,
  finalPath,
  promptsPath,
  readmePath,
  videosDir,
  voiceDir,
} from "./storage";
export { promptsPath, videoPath } from "./storage";
import { jobDateStamp, slugify } from "./slug";
import { renderPromptsMd } from "./promptsMd";
import { ffprobe } from "../compose/ffmpeg";
import { PipelineConcurrency } from "../lib/config";

export type TtsEvent = {
  type: "tts";
  segmentId: string;
  index: number;
  status: "start" | "done" | "error" | "cached";
  path?: string;
  message?: string;
};

export type RenderEvent =
  | { type: "started"; jobId: string; totalSegments: number }
  | TtsEvent
  | {
      type: "compose";
      status: "start" | "pack-done" | "pack-error" | "done" | "error";
      current?: number;
      total?: number;
      segmentId?: string;
      message?: string;
      outPath?: string;
      durationSec?: number;
    }
  | { type: "done"; outPath: string; durationSec: number }
  | { type: "error"; message: string; fatal: boolean };

export interface CreateBriefResult {
  jobId: string;
  jobDir: string;
  script: Script;
  promptsMd: string;
}

export interface VideoStatus {
  segmentId: string;
  uploaded: boolean;
  durationSec?: number;
  width?: number;
  height?: number;
  expectedPath: string;
}

export interface JobStatus {
  jobId: string;
  jobDir: string;
  script: Script;
  videos: VideoStatus[];
  audioUploaded: boolean;
  finalExists: boolean;
  finalPath: string;
}

export class JobService extends Effect.Service<JobService>()("app/JobService", {
  effect: Effect.gen(function* () {
    const scriptSvc = yield* ScriptService;
    const ttsSvc = yield* TtsService;
    const composeSvc = yield* ComposeService;
    const storage = yield* JobStorage;
    const concurrency = yield* PipelineConcurrency;

    // ---------- createBrief ----------

    const createBrief = (input: BriefInput) =>
      Effect.gen(function* () {
        yield* Effect.logInfo("creating brief", { theme: input.theme, type: input.storyType });

        const script = yield* scriptSvc.generate(input);

        const stamp = jobDateStamp();
        const slug = slugify(input.theme) || input.storyType;
        const jobId = `${stamp}-${slug}`;
        const jobDir = storage.jobDir(jobId);

        yield* storage.ensureDir(jobDir);
        yield* storage.ensureDir(videosDir(jobDir));
        yield* storage.ensureDir(voiceDir(jobDir));

        // Validate callouts
        const calloutIssues = validateCallouts(script);
        if (calloutIssues.length > 0) {
          yield* Effect.logWarning("callout validation issues", { issues: calloutIssues });
        }

        // Write artifacts
        yield* storage.writeJson(scriptPath(jobDir), script);
        const promptsMd = renderPromptsMd(script, jobId);
        yield* storage.writeText(promptsPath(jobDir), promptsMd);
        yield* storage.writeText(readmePath(jobDir), renderJobReadme(script, jobId));

        yield* Effect.logInfo("brief created", { jobId, segments: script.segments.length });

        return { jobId, jobDir, script, promptsMd } as const;
      });

    // ---------- getStatus ----------

    const getStatus = (jobId: string) =>
      Effect.gen(function* () {
        const job = yield* storage.getJob(jobId);
        const videos: VideoStatus[] = [];
        for (const seg of job.script.segments) {
          const p = videoPath(job.jobDir, seg.id);
          const ex = yield* storage.exists(p);
          if (ex) {
            const probe = yield* ffprobe(p).pipe(
              Effect.orElseSucceed(() => ({ duration: 0, width: 0, height: 0 })),
            );
            videos.push({
              segmentId: seg.id,
              uploaded: true,
              durationSec: probe.duration,
              width: probe.width,
              height: probe.height,
              expectedPath: p,
            });
          } else {
            videos.push({
              segmentId: seg.id,
              uploaded: false,
              expectedPath: p,
            });
          }
        }

        const finalPathStr = finalPath(job.jobDir);
        const finalExists = yield* storage.exists(finalPathStr);

        // Check if any audio exists
        const firstAudio = audioPath(job.jobDir, job.script.segments[0]?.id ?? "seg-001");
        const audioUploaded = yield* storage.exists(firstAudio);

        return {
          jobId,
          jobDir: job.jobDir,
          script: job.script,
          videos,
          audioUploaded,
          finalExists,
          finalPath: finalPathStr,
        } as const;
      });

    // ---------- renderJob (Stream of RenderEvent) ----------

    const renderJob = (jobId: string) =>
      Stream.asyncEffect<RenderEvent, never>((emit) =>
        Effect.gen(function* () {
          const job = yield* storage.getJob(jobId).pipe(
            Effect.tapError((e) =>
              Effect.sync(() =>
                emit.single({
                  type: "error",
                  message: e instanceof Error ? e.message : String(e),
                  fatal: true,
                }),
              ),
            ),
          );
          if (!job) return;

          emit.single({
            type: "started",
            jobId,
            totalSegments: job.script.segments.length,
          });

          // Validate videos first
          const missing: string[] = [];
          for (const seg of job.script.segments) {
            const p = videoPath(job.jobDir, seg.id);
            const ex = yield* storage.exists(p);
            if (!ex) missing.push(seg.id);
          }
          if (missing.length > 0) {
            emit.single({
              type: "error",
              message: `Missing ${missing.length} video(s): ${missing.join(", ")}`,
              fatal: true,
            });
            return;
          }

          // TTS — synthesize per segment, stream per-segment events into the render stream.
          // Voice priority: script.ttsVoiceHint (set from brief) > env default.
          yield* ttsSvc
            .synthesizeAllStream(job.script.segments, voiceDir(job.jobDir), job.script.ttsVoiceHint)
            .pipe(
              Stream.tap((ttsEvent) => Effect.sync(() => emit.single(ttsEvent))),
              Stream.runDrain,
            );

          // Render callouts.ass
          const ass = renderCalloutsAss(job.script);
          yield* storage.writeText(calloutsPath(job.jobDir), ass);

          // Compose
          const videoPaths = job.script.segments.map((s: Segment) => videoPath(job.jobDir, s.id));
          const audioPaths = job.script.segments.map((s: Segment) => audioPath(job.jobDir, s.id));
          const out = finalPath(job.jobDir);

          const result = yield* composeSvc
            .compose({
              script: job.script,
              videoPaths,
              audioPaths,
              calloutsAssPath: calloutsPath(job.jobDir),
              outPath: out,
              padMode: "freeze",
              onEvent: (e: ComposeEvent) => {
                // Translate compose events to render events
                if (e.type === "compose-start") {
                  emit.single({
                    type: "compose",
                    status: "start",
                    total: e.totalPacks,
                  });
                } else if (e.type === "compose-pack-done") {
                  emit.single({
                    type: "compose",
                    status: "pack-done",
                    current: e.index + 1,
                    total: videoPaths.length,
                    segmentId: e.segmentId,
                  });
                } else if (e.type === "compose-pack-error") {
                  emit.single({
                    type: "compose",
                    status: "pack-error",
                    current: e.index + 1,
                    total: videoPaths.length,
                    segmentId: e.segmentId,
                    message: e.message,
                  });
                } else if (e.type === "compose-done") {
                  emit.single({
                    type: "compose",
                    status: "done",
                    outPath: e.outPath,
                    durationSec: e.duration,
                  });
                } else if (e.type === "compose-error") {
                  emit.single({
                    type: "compose",
                    status: "error",
                    message: e.message,
                  });
                }
              },
            })
            .pipe(
              Effect.tapError((e) =>
                Effect.sync(() => emit.single({ type: "error", message: e.message, fatal: true })),
              ),
            );

          emit.single({
            type: "done",
            outPath: result.outPath,
            durationSec: result.duration,
          });
        }).pipe(
          Effect.ensuring(Effect.sync(() => emit.end())),
          Effect.catchAll((e: unknown) =>
            Effect.sync(() => {
              emit.single({
                type: "error",
                message: e instanceof Error ? e.message : String(e),
                fatal: true,
              });
            }),
          ),
        ),
      );

    const jobDir = (jobId: string) => storage.jobDir(jobId);

    return { createBrief, getStatus, renderJob, jobDir, listJobs: storage.listJobs } as const;
  }),
  dependencies: [
    ScriptService.Default,
    TtsService.Default,
    ComposeService.Default,
    JobStorage.Default,
  ],
}) {}

// ---------- helpers ----------

function renderJobReadme(script: Script, jobId: string): string {
  return `# ${script.title}

**Story type:** ${script.storyType}  •  **Lang:** ${script.lang}  •  **Aspect:** ${script.aspectRatio}  •  **~${Math.round(script.totalDuration / 60)} min**

## Workflow

### Step 1 — Generate the videos (manual, ~5-15 min)

1. Open \`prompts.md\` in this folder.
2. For each segment: copy the **Visual prompt** → paste into Google Gemini chat → ask for a ${script.aspectRatio} video clip → download → save as \`videos/<segId>.mp4\`.
3. Use the checklist at the bottom of \`prompts.md\` to track progress.

### Step 2 — Render (automatic, ~1 min)

Go to the **Render** tab in the UI and click **Render**. This will:
- Run MiniMax TTS for each segment (cached if already done)
- Generate \`callouts.ass\` (motion text overlay)
- Merge audio + video + callouts into \`final.mp4\`

## Files in this folder

| File | What | Who writes |
|------|------|------------|
| \`script.json\` | Structured script | brief |
| \`prompts.md\` | Copy-paste video prompts | brief |
| \`videos/seg-NNN.mp4\` | Per-segment videos | **you** |
| \`voice/seg-NNN.mp3\` | Per-segment TTS | render |
| \`callouts.ass\` | Motion text overlay | render |
| \`final.mp4\` | The finished video | render |
`;
}
