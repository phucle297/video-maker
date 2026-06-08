/**
 * The Effect ManagedRuntime for Server Actions and Route Handlers.
 *
 * All services (ScriptService, TtsService, ComposeService, JobService, JobStorage)
 * are bundled into a single runtime. Server Actions call runtime.runPromise.
 *
 * The runtime is created ONCE per process (Node/Bun) and reused across requests.
 */

import { Layer, ManagedRuntime } from "effect";
import { NodeContext } from "@effect/platform-node";
import { ScriptService } from "@/domain/script/service";
import { TtsService } from "@/domain/tts/service";
import { ComposeService } from "@/domain/compose/service";
import { JobService } from "@/domain/jobs/service";
import { JobStorage } from "@/domain/jobs/storage";

const MainLayer = Layer.mergeAll(
  JobService.Default,
  ScriptService.Default,
  TtsService.Default,
  ComposeService.Default,
  JobStorage.Default,
).pipe(Layer.provide(NodeContext.layer));

declare global {
  // eslint-disable-next-line no-var
  var __appEffectRuntime: ManagedRuntime.ManagedRuntime<never, never> | undefined;
}

export const runtime =
  globalThis.__appEffectRuntime ??
  ManagedRuntime.make(MainLayer, { memoMap: new Map() });

if (process.env.NODE_ENV !== "production") {
  globalThis.__appEffectRuntime = runtime;
}
