/**
 * The Effect ManagedRuntime for Server Actions and Route Handlers.
 *
 * All services (ScriptService, TtsService, ComposeService, JobService, JobStorage)
 * are bundled into a single runtime. Server Actions call runtime.runPromise.
 *
 * The runtime is created ONCE per process (Bun) and reused across requests.
 */

import { Layer, ManagedRuntime } from "effect";
import { AppLogger } from "@/domain/lib/logger";
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
  AppLogger,
);

type AppServices = Layer.Layer.Success<typeof MainLayer>;
type AppErrors = Layer.Layer.Error<typeof MainLayer>;

declare global {
  // eslint-disable-next-line no-var
  var __appEffectRuntime: ManagedRuntime.ManagedRuntime<AppServices, AppErrors> | undefined;
}

export const runtime: ManagedRuntime.ManagedRuntime<AppServices, AppErrors> =
  globalThis.__appEffectRuntime ?? ManagedRuntime.make(MainLayer);

if (process.env.NODE_ENV !== "production") {
  globalThis.__appEffectRuntime = runtime;
}
