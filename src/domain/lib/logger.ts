/**
 * Effect Logger — structured logging with sensible defaults.
 *
 * In development: pretty-printed to stdout.
 * In production: structured JSON.
 *
 * Usage:
 *   yield* Effect.logInfo("step done", { durationMs: 123 })
 *   yield* Effect.logError("step failed", error)
 */

import { Logger, LogLevel } from "effect";

export const AppLogger = Logger.replace(Logger.defaultLogger, Logger.prettyLoggerDefault);

export const LogLevelFromEnv = (level: string): LogLevel.LogLevel => {
  switch (level.toLowerCase()) {
    case "debug":
      return LogLevel.Debug;
    case "info":
      return LogLevel.Info;
    case "warn":
    case "warning":
      return LogLevel.Warning;
    case "error":
      return LogLevel.Error;
    default:
      return LogLevel.Info;
  }
};
