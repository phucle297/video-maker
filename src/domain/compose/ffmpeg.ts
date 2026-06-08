/**
 * ffmpeg wrapper, Effect-styled.
 *
 * Run ffmpeg with a given arg list, capture errors as FfmpegError.
 */

import { Effect } from "effect";
import { spawn, type ChildProcess } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { FfmpegError } from "../lib/errors";

const FFMPEG = ffmpegInstaller.path;
const FFPROBE = FFMPEG.replace(/ffmpeg$/, "ffprobe");

export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  codec?: string;
}

const runFfmpegAcquire = (
  args: readonly string[],
  options: { inheritIO?: boolean },
): Effect.Effect<void, FfmpegError, never> =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      spawn(FFMPEG, args, {
        stdio: options.inheritIO ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
      }),
    ),
    (proc) =>
      Effect.async<void, FfmpegError>((resume) => {
        let stderr = "";
        if (!options.inheritIO && proc.stderr) {
          proc.stderr.on("data", (d) => (stderr += d.toString()));
        }
        proc.on("error", (e) =>
          resume(
            Effect.fail(
              new FfmpegError({
                message: "ffmpeg spawn failed",
                command: args.join(" "),
                cause: e,
              }),
            ),
          ),
        );
        proc.on("close", (code) => {
          if (code === 0) resume(Effect.void);
          else
            resume(
              Effect.fail(
                new FfmpegError({
                  message: `ffmpeg exit ${code}: ${stderr.slice(-300)}`,
                  command: args.join(" "),
                }),
              ),
            );
        });
      }),
    (proc: ChildProcess) =>
      Effect.sync(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // ignore
        }
      }),
  );

export const runFfmpeg = (
  args: readonly string[],
  options: { inheritIO?: boolean } = {},
): Effect.Effect<void, FfmpegError> =>
  Effect.gen(function* () {
    yield* Effect.logDebug("ffmpeg", { args: args.join(" ") });
    yield* runFfmpegAcquire(args, options);
  });

const ffprobeAcquire = (file: string): Effect.Effect<string, FfmpegError, never> =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      spawn(FFPROBE, [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,codec_name",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        file,
      ]),
    ),
    (proc) =>
      Effect.async<string, FfmpegError>((resume) => {
        let out = "";
        let err = "";
        if (proc.stdout) proc.stdout.on("data", (d) => (out += d));
        if (proc.stderr) proc.stderr.on("data", (d) => (err += d));
        proc.on("error", (e) =>
          resume(
            Effect.fail(
              new FfmpegError({
                message: "ffprobe spawn failed",
                command: file,
                cause: e,
              }),
            ),
          ),
        );
        proc.on("close", (code) => {
          if (code === 0) resume(Effect.succeed(out));
          else
            resume(
              Effect.fail(
                new FfmpegError({
                  message: `ffprobe exit ${code}: ${err}`,
                  command: file,
                }),
              ),
            );
        });
      }),
    (proc: ChildProcess) =>
      Effect.sync(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // ignore
        }
      }),
  );

export const ffprobe = (file: string): Effect.Effect<ProbeResult, FfmpegError> =>
  Effect.gen(function* () {
    const stdout = yield* ffprobeAcquire(file);

    const parsed = yield* Effect.try({
      try: () =>
        JSON.parse(stdout) as {
          streams?: { width?: number; height?: number; codec_name?: string }[];
          format?: { duration?: string | number };
        },
      catch: (e) => new FfmpegError({ message: "ffprobe: invalid JSON", cause: e }),
    });

    const stream = parsed.streams?.[0] ?? {};
    return {
      duration: Number(parsed.format?.duration ?? 0),
      width: Number(stream.width ?? 0),
      height: Number(stream.height ?? 0),
      codec: stream.codec_name,
    };
  });
