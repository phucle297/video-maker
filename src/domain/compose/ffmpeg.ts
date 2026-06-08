/**
 * ffmpeg wrapper, Effect-styled.
 *
 * Run ffmpeg with a given arg list, capture errors as FfmpegError.
 */

import { Effect } from "effect";
import { spawn } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { FfmpegError } from "../lib/errors.js";

const FFMPEG = ffmpegInstaller.path;
const FFPROBE = FFMPEG.replace(/ffmpeg$/, "ffprobe");

export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  codec?: string;
}

export const runFfmpeg = (
  args: readonly string[],
  options: { inheritIO?: boolean } = {},
): Effect.Effect<void, FfmpegError> =>
  Effect.gen(function* () {
    yield* Effect.logDebug("ffmpeg", { args: args.join(" ") });

    yield* Effect.async<void, FfmpegError>((resume) => {
      const proc = spawn(FFMPEG, args, {
        stdio: options.inheritIO ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      if (!options.inheritIO && proc.stderr) {
        proc.stderr.on("data", (d) => (stderr += d.toString()));
      }
      proc.on("error", (e) =>
        resume(
          Effect.fail(
            new FfmpegError({ message: "ffmpeg spawn failed", command: args.join(" "), cause: e }),
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
    });
  });

export const ffprobe = (file: string): Effect.Effect<ProbeResult, FfmpegError> =>
  Effect.gen(function* () {
    const stdout = yield* Effect.async<string, FfmpegError>((resume) => {
      const proc = spawn(FFPROBE, [
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
      ]);
      let out = "";
      let err = "";
      proc.stdout.on("data", (d) => (out += d));
      proc.stderr.on("data", (d) => (err += d));
      proc.on("error", (e) =>
        resume(
          Effect.fail(
            new FfmpegError({ message: "ffprobe spawn failed", command: file, cause: e }),
          ),
        ),
      );
      proc.on("close", (code) => {
        if (code === 0) resume(Effect.succeed(out));
        else
          resume(
            Effect.fail(new FfmpegError({ message: `ffprobe exit ${code}: ${err}`, command: file })),
          );
      });
    });

    const parsed = yield* Effect.try({
      try: () => JSON.parse(stdout) as { streams?: { width?: number; height?: number; codec_name?: string }[]; format?: { duration?: string | number } },
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
