/**
 * POST /api/jobs/[jobId]/render — start a render, stream progress via SSE.
 *
 * Uses Effect's Stream to emit RenderEvent values one at a time.
 * Each event is sent as a `data: <json>\n\n` line to the client.
 */

import { runtime } from "@/lib/runtime";
import { JobService } from "@/domain/jobs/service";
import { Effect, Stream, Exit } from "effect";

export const dynamic = "force-dynamic";
export const runtime2 = "nodejs"; // we use ffmpeg child_process

export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  // Get the stream from the service
  const streamEffect = Effect.gen(function* () {
    const jobSvc = yield* JobService;
    return jobSvc.renderJob(jobId);
  });

  const streamExit = await runtime.runPromiseExit(streamEffect);
  if (Exit.isFailure(streamExit)) {
    return new Response(JSON.stringify({ error: "Failed to start render" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const stream = streamExit.value;

  // Convert Effect Stream → ReadableStream<Response>
  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for await (const event of Stream.toAsyncIterable(stream)) {
          send(event);
          if (event.type === "done" || event.type === "error") {
            controller.close();
            return;
          }
        }
        controller.close();
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e), fatal: true });
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
