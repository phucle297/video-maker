/**
 * ComposeService — merges per-segment videos + audio + callouts into final.mp4.
 *
 * Strategy:
 *   1. For each segment, build a "pack" MP4: scaled+padded video + audio,
 *      duration-matched via tpad (freeze last frame by default)
 *   2. Concat packs with ffmpeg concat demuxer
 *   3. Burn callouts.ass via the ass filter
 *   4. Re-encode to libx264 / aac for max compatibility
 *
 * Emits RenderEvent values for the UI to consume via SSE.
 */

import { Config, Effect, Layer, Stream } from "effect";
import { promises as fs } from "node:fs";
import path from "node:path";
import { runFfmpeg, ffprobe } from "./ffmpeg.js";
import { FileSystemError } from "../lib/errors.js";
import type { Script } from "../script/schema.js";

export type RenderEvent =
  | { type: "compose-start"; totalPacks: number }
  | { type: "compose-pack-done"; index: number; segmentId: string }
  | { type: "compose-pack-error"; index: number; segmentId: string; message: string }
  | { type: "compose-done"; outPath: string; duration: number }
  | { type: "compose-error"; message: string };

export interface ComposeInput {
  script: Script;
  videoPaths: readonly string[];
  audioPaths: readonly string[];
  calloutsAssPath: string;
  outPath: string;
  padMode?: "freeze" | "black";
  /** Emit RenderEvents to this queue (best-effort). */
  onEvent?: (event: RenderEvent) => void;
}

const dimsFor = (aspect: string): { w: number; h: number } => {
  if (aspect === "9:16") return { w: 1080, h: 1920 };
  if (aspect === "16:9") return { w: 1920, h: 1080 };
  return { w: 1080, h: 1080 };
};

async function buildPerSegmentPack(
  segIndex: number,
  segId: string,
  videoPath: string,
  audioPath: string,
  outDir: string,
  w: number,
  h: number,
  padMode: "freeze" | "black",
): Promise<{ path: string; duration: number }> {
  const outPath = path.join(outDir, `pack-${String(segIndex).padStart(3, "0")}.mp4`);

  const vProbe = await ffprobe(videoPath).then((p) => p, () => ({ duration: 0, width: 0, height: 0 }));
  const aProbe = await ffprobe(audioPath).then((p) => p, () => ({ duration: 0, width: 0, height: 0 }));

  const vDur = vProbe.duration;
  const aDur = aProbe.duration;
  let padFilter = "";
  if (aDur > vDur + 0.1) {
    const extra = aDur - vDur;
    padFilter =
      padMode === "black"
        ? `,tpad=stop_mode=add:stop_duration=${extra.toFixed(3)}:color=black`
        : `,tpad=stop_mode=clone:stop_duration=${extra.toFixed(3)}`;
  }

  const scaleFilter = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,fps=30${padFilter},setsar=1`;

  await runFfmpeg(
    [
      "-y",
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-filter_complex",
      `[0:v]${scaleFilter}[v];[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo,apad[a]`,
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-t",
      aDur.toFixed(3),
      outPath,
    ],
    { inheritIO: false },
  ).then(() => undefined, (e) => { throw e; });

  return { path: outPath, duration: aDur };
}

export const compose = (input: ComposeInput): Effect.Effect<{ outPath: string; duration: number }, FileSystemError> =>
  Effect.gen(function* () {
    const { script, videoPaths, audioPaths, calloutsAssPath, outPath } = input;
    const padMode = input.padMode ?? "freeze";
    const { w, h } = dimsFor(script.aspectRatio);

    const emit = (e: RenderEvent) => input.onEvent?.(e);

    emit({ type: "compose-start", totalPacks: videoPaths.length });

    yield* Effect.tryPromise({
      try: () => fs.mkdir(path.dirname(outPath), { recursive: true }),
      catch: (e) => new FileSystemError({ message: "mkdir failed", path: path.dirname(outPath), cause: e }),
    });

    const tmpDir = path.join(path.dirname(outPath), ".tmp-packs");
    yield* Effect.tryPromise({
      try: () => fs.mkdir(tmpDir, { recursive: true }),
      catch: (e) => new FileSystemError({ message: "mkdir failed", path: tmpDir, cause: e }),
    });

    // Build packs sequentially (ffmpeg is heavy; parallel = memory pressure)
    const packs: { path: string; duration: number }[] = [];
    for (let i = 0; i < videoPaths.length; i++) {
      const seg = script.segments[i];
      const v = videoPaths[i];
      const a = audioPaths[i];
      if (!seg || !v || !a) continue;

      try {
        const pack = yield* Effect.tryPromise({
          try: () => buildPerSegmentPack(i, seg.id, v, a, tmpDir, w, h, padMode),
          catch: (e) => new FileSystemError({ message: `pack ${i} failed`, cause: e }),
        });
        packs.push(pack);
        emit({ type: "compose-pack-done", index: i, segmentId: seg.id });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        emit({ type: "compose-pack-error", index: i, segmentId: seg.id, message });
        // Continue with what we have
      }
    }

    // Concat
    const concatList = path.join(tmpDir, "concat.txt");
    const listBody = packs.map((p) => `file '${p.path.replace(/'/g, "'\\''")}'`).join("\n");
    yield* Effect.tryPromise({
      try: () => fs.writeFile(concatList, listBody, "utf-8"),
      catch: (e) => new FileSystemError({ message: "write concat list failed", path: concatList, cause: e }),
    });

    const assFilter = `ass=${calloutsAssPath.replace(/'/g, "'\\''")}`;

    yield* runFfmpeg(
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatList,
        "-vf",
        assFilter,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        outPath,
      ],
      { inheritIO: false },
    ).pipe(
      Effect.tapError((e) => Effect.sync(() => emit({ type: "compose-error", message: e.message }))),
    );

    // Cleanup
    yield* Effect.tryPromise({
      try: () => fs.rm(tmpDir, { recursive: true, force: true }),
      catch: () => undefined,
    }).pipe(Effect.ignoreLogged);

    const probe = yield* ffprobe(outPath).pipe(Effect.orElseSucceed(() => ({ duration: 0, width: 0, height: 0 })));

    emit({ type: "compose-done", outPath, duration: probe.duration });

    return { outPath, duration: probe.duration };
  });

export class ComposeService extends Effect.Service<ComposeService>()("app/ComposeService", {
  effect: Effect.succeed({ compose } as const),
}) {}
