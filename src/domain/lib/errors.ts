/**
 * Tagged error types used across the domain.
 *
 * Using `Schema.TaggedError` makes them:
 *   - serializable (so they survive the Server Action boundary cleanly)
 *   - pattern-matchable (`Effect.catchTag("LLMError", ...)`)
 *   - automatically discriminated in client code
 */

import { Schema } from "effect";

export class LLMError extends Schema.TaggedError<LLMError>()("LLMError", {
  message: Schema.String,
  status: Schema.optional(Schema.Number),
  cause: Schema.optional(Schema.Unknown),
}) {}

export class TtsError extends Schema.TaggedError<TtsError>()("TtsError", {
  message: Schema.String,
  status: Schema.optional(Schema.Number),
  cause: Schema.optional(Schema.Unknown),
}) {}

export class ValidationError extends Schema.TaggedError<ValidationError>()("ValidationError", {
  message: Schema.String,
  field: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Unknown),
}) {}

export class FfmpegError extends Schema.TaggedError<FfmpegError>()("FfmpegError", {
  message: Schema.String,
  command: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Unknown),
}) {}

export class FileSystemError extends Schema.TaggedError<FileSystemError>()("FileSystemError", {
  message: Schema.String,
  path: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Unknown),
}) {}

export class JobNotFoundError extends Schema.TaggedError<JobNotFoundError>()("JobNotFoundError", {
  message: Schema.String,
  jobId: Schema.String,
}) {}

export class MissingVideosError extends Schema.TaggedError<MissingVideosError>()(
  "MissingVideosError",
  {
    message: Schema.String,
    missing: Schema.Array(Schema.String),
  },
) {}

export type DomainError =
  | LLMError
  | TtsError
  | ValidationError
  | FfmpegError
  | FileSystemError
  | JobNotFoundError
  | MissingVideosError;
