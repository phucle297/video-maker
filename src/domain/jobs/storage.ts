/**
 * Filesystem storage helpers for jobs.
 *
 * Job directory layout:
 *   {OUTPUT_DIR}/{jobId}/
 *   ├── script.json
 *   ├── prompts.md
 *   ├── README.md
 *   ├── videos/seg-NNN.mp4
 *   ├── voice/seg-NNN.mp3
 *   ├── callouts.ass
 *   └── final.mp4
 */

import { Config, Effect, Layer } from "effect";
import { promises as fs } from "node:fs";
import path from "node:path";
import { OutputDir } from "../lib/config.js";
import { FileSystemError, JobNotFoundError } from "../lib/errors.js";
import type { Script } from "../script/schema.js";

export const scriptPath = (jobDir: string) => path.join(jobDir, "script.json");
export const promptsPath = (jobDir: string) => path.join(jobDir, "prompts.md");
export const readmePath = (jobDir: string) => path.join(jobDir, "README.md");
export const calloutsPath = (jobDir: string) => path.join(jobDir, "callouts.ass");
export const finalPath = (jobDir: string) => path.join(jobDir, "final.mp4");
export const videosDir = (jobDir: string) => path.join(jobDir, "videos");
export const voiceDir = (jobDir: string) => path.join(jobDir, "voice");
export const videoPath = (jobDir: string, segId: string) =>
  path.join(videosDir(jobDir), `${segId}.mp4`);
export const audioPath = (jobDir: string, segId: string) =>
  path.join(voiceDir(jobDir), `${segId}.mp3`);

export class JobStorage extends Effect.Service<JobStorage>()("app/JobStorage", {
  effect: Effect.gen(function* () {
    const outRoot = yield* OutputDir;

    const ensureDir = (p: string) =>
      Effect.tryPromise({
        try: () => fs.mkdir(p, { recursive: true }),
        catch: (e) => new FileSystemError({ message: "mkdir failed", path: p, cause: e }),
      });

    const writeText = (p: string, text: string) =>
      Effect.tryPromise({
        try: () => fs.writeFile(p, text, "utf-8"),
        catch: (e) => new FileSystemError({ message: "write failed", path: p, cause: e }),
      });

    const writeJson = (p: string, data: unknown) =>
      Effect.tryPromise({
        try: () => fs.writeFile(p, JSON.stringify(data, null, 2), "utf-8"),
        catch: (e) => new FileSystemError({ message: "write failed", path: p, cause: e }),
      });

    const readJson = <T>(p: string) =>
      Effect.tryPromise({
        try: async () => JSON.parse(await fs.readFile(p, "utf-8")) as T,
        catch: (e) => new FileSystemError({ message: "read failed", path: p, cause: e }),
      });

    const readText = (p: string) =>
      Effect.tryPromise({
        try: () => fs.readFile(p, "utf-8"),
        catch: (e) => new FileSystemError({ message: "read failed", path: p, cause: e }),
      });

    const exists = (p: string) =>
      Effect.tryPromise({
        try: async () => {
          try {
            await fs.access(p);
            return true;
          } catch {
            return false;
          }
        },
        catch: () => false,
      }).pipe(Effect.orElseSucceed(() => false));

    const jobDir = (jobId: string) => path.resolve(outRoot, jobId);

    const listJobs = () =>
      Effect.gen(function* () {
        const exists = yield* Effect.tryPromise({
          try: async () => {
            try {
              await fs.access(outRoot);
              return true;
            } catch {
              return false;
            }
          },
          catch: () => false,
        }).pipe(Effect.orElseSucceed(() => false));
        if (!exists) return [] as string[];

        return yield* Effect.tryPromise({
          try: async () => {
            const entries = await fs.readdir(outRoot, { withFileTypes: true });
            return entries
              .filter((e) => e.isDirectory())
              .map((e) => e.name)
              .sort()
              .reverse();
          },
          catch: (e) => [] as string[],
        });
      });

    const getJob = (jobId: string) =>
      Effect.gen(function* () {
        const dir = jobDir(jobId);
        const dirExists = yield* exists(dir);
        if (!dirExists) {
          return yield* Effect.fail(new JobNotFoundError({ message: "job not found", jobId }));
        }
        const script = yield* readJson<Script>(scriptPath(dir)).pipe(
          Effect.mapError(
            (e) =>
              new FileSystemError({
                message: `script.json unreadable for job ${jobId}`,
                path: scriptPath(dir),
                cause: e,
              }),
          ),
        );
        return { jobId, jobDir: dir, script };
      });

    return {
      outRoot,
      jobDir,
      ensureDir,
      writeText,
      writeJson,
      readJson,
      readText,
      exists,
      listJobs,
      getJob,
    } as const;
  }),
}) {}
