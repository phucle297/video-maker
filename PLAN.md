# Story Video Factory — Implementation Plan (v5)

> Full-stack web app: **idea → script (MiniMax LLM) → video prompts (you + Gemini chat) → voice (MiniMax TTS) → merge → final MP4** — all driven from a Next.js UI with live progress.
>
> **Your stack:** MiniMax subscription (LLM + TTS via one API key) + Google Gemini consumer plan (videos via chat only, not API).
>
> **Runtime stack:** Bun + TypeScript + [Effect](https://effect.website/) (error handling, validation, fibers) + Next.js 15 (App Router) + Oxc (oxlint + oxfmt).
>
> **Operating mode:** `manual` (v1) — system emits video prompts, you generate clips via Gemini chat, drop them in, render from the UI.

---

## 1. Goals & Scope

**What it is**
A web app where you:
1. Fill in a brief (story type, theme, length, voice).
2. The app generates a script + video prompts in the browser (live).
3. You work through the prompts in Gemini chat, drop the videos in.
4. Hit **Render** — the app runs TTS, merges video + audio + callouts, shows progress live, gives you a final.mp4.

**Why this stack**
- **Bun** — fast install, built-in TS, native fetch, native SQLite if we need persistence later. Runs Next.js fine in dev/prod.
- **Effect** — typed errors (no try/catch), built-in Schema (no zod), fibers for concurrency (no p-limit), `Stream` for live progress, `Layer` for DI, `Schedule` for retry/backoff, `Config` for env. The whole domain is a pure function of dependencies.
- **Next.js 15 App Router** — Server Actions for mutations, Route Handlers for SSE progress, React 19 for the UI, server components for zero-JS-by-default, client islands for live progress.
- **Oxc** — `oxlint` (faster than ESLint), `oxfmt` (faster than Prettier). No Babel/Webpack/Turbopack config noise.
- **MiniMax LLM** — same API key as TTS, supports `response_format: { type: "json_object" }` for structured output. Cheap and good at Vietnamese.

**Content flavors (v1)**
| Story type    | Tone                                                       |
| ------------- | ---------------------------------------------------------- |
| `nosleep`     | First-person, present tense, "this really happened"       |
| `creepypasta` | Internet horror, longer form, more atmospheric             |
| `mystic`      | Second-person, dreamlike, surreal                          |
| `rules`       | Listicle, count-up reveal                                  |
| `imagine`     | Choose-your-path (v1 ships linear)                         |

**Operating modes (v1 ships `manual` only)**
| Mode        | Visuals produced by                              | Status           |
| ----------- | ------------------------------------------------ | ---------------- |
| `manual`    | You + Gemini chat (drop files in)                | **ship v1**      |
| `auto`      | MiniMax / Veo API (when available)               | v2               |
| `hybrid`    | Auto with per-segment manual fallback            | v2               |

**Out of scope (for now)**
- Auto publishing to YouTube/TikTok
- Branching playback for `imagine` (linear only)
- Long-form (>10 min) videos
- Music / SFX bed
- Multi-user / auth (single-user local app)
- Cloud storage (local filesystem only)

---

## 2. High-Level Architecture

```
                          ┌──────────────────────────┐
                          │      Next.js 15 UI       │
                          │  (React 19, App Router)  │
                          └────────────┬─────────────┘
                                       │ Server Actions / SSE
                                       ▼
   ┌──────────────────────────────────────────────────────────────┐
   │                     Effect Domain Layer                      │
   │                                                              │
   │   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌───────┐  │
   │   │ Script   │───▶│ TTS      │───▶│ Compose  │───▶│ Job   │  │
   │   │ Service  │    │ Service  │    │ Service  │    │ Store │  │
   │   └────┬─────┘    └────┬─────┘    └────┬─────┘    └───┬───┘  │
   │        │               │               │              │      │
   │        ▼               ▼               ▼              ▼      │
   │   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌───────┐  │
   │   │ LLM      │    │ TTS      │    │ FFmpeg   │    │ File  │  │
   │   │ Client   │    │ Client   │    │ Wrapper  │    │ System│  │
   │   └────┬─────┘    └────┬─────┘    └──────────┘    └───────┘  │
   │        │               │                                       │
   └────────┼───────────────┼───────────────────────────────────────┘
            ▼               ▼
       ┌─────────┐    ┌──────────┐
       │ MiniMax │    │ MiniMax  │
       │   LLM   │    │   TTS    │
       └─────────┘    └──────────┘

       ┌──────────────────────┐
       │   outputs/{jobId}/   │   ← local filesystem (v1)
       │  script.json         │
       │  prompts.md          │   ← read by YOU in browser
       │  videos/             │   ← YOU drop mp4s here
       │  voice/              │   ← system writes mp3s
       │  callouts.ass        │   ← system writes
       │  final.mp4           │   ← final artifact
       └──────────────────────┘
```

**Concurrency model**
- All multi-step work runs inside Effect's runtime, which manages fibers for us.
- TTS per segment is `Effect.forEach(segments, { concurrency: 3, batching: false })` — internally fibers, scheduled fairly.
- Render progress is a `Stream<RenderEvent>` consumed by the SSE route handler.

**Error model**
- Every effectful function returns `Effect<A, E, R>` where `E` is a tagged union (e.g. `LLMError | SchemaError | FfmpegError`).
- The UI renders typed errors with structured messages — no more "An unknown error occurred".
- `Effect.retry(Schedule.exponential(...))` wraps every external call. Transient failures are invisible to the user.

---

## 3. Tech Stack

| Layer              | Choice                                        | Why                                       |
| ------------------ | --------------------------------------------- | ----------------------------------------- |
| Runtime            | **Bun 1.x**                                   | Fast install, native TS, native fetch     |
| Language           | TypeScript 5.x (strict)                       | Type safety everywhere                    |
| Framework          | **Next.js 15** (App Router)                   | Server actions, SSE, React 19             |
| UI                 | React 19 + plain CSS (no Tailwind for v1)     | Zero-config, fast cold start              |
| Effects / runtime  | **Effect 3.x** (`effect`, `@effect/schema`, `@effect/platform`) | Errors, Schema, fibers, Stream, Layer, Schedule, Config |
| LLM                | **MiniMax** `MiniMax-Text-01` (json_object mode) | Same key as TTS, good Vietnamese         |
| TTS                | **MiniMax** TTS HTTP                          | Deep warm male: `male-qn-jingying`        |
| Video compose      | `@ffmpeg-installer/ffmpeg` + child_process     | Cross-platform, no system dep             |
| Linter             | **oxlint**                                    | ~100× faster than ESLint                  |
| Formatter          | **oxfmt**                                     | ~30× faster than Prettier                 |
| Persistence        | Local filesystem (v1) → SQLite via Bun (v2)   | No setup, easy backup                     |
| Deployment         | `bun run build` → standalone Next.js          | Single binary, no Node needed             |

**Why no Tailwind / shadcn for v1**
Pure CSS is fine for ~10 components, no build step noise. Easy to add later if needed.

**Why Effect instead of plain async/await + zod**
- Errors are values, not exceptions. The UI can pattern-match on `LLMError` vs `FfmpegError` vs `ValidationError` and render different messages.
- Schemas double as decoders AND validators, no separate zod step.
- `Stream` + SSE is 5 lines, not 50.
- Fibers for `Effect.all({ concurrency: 3 })` are deterministic, cancelable, and report errors as they happen.
- `Config` integration gives us typed env access (no `process.env.X` stringly-typed everywhere).

---

## 4. Project Layout

```
story-video-factory/
├── package.json                       # bun-managed
├── bunfig.toml
├── bun.lock                           # generated
├── next.config.ts
├── tsconfig.json
├── oxlint.json
├── .oxfmtrc.json
├── .env.example
├── .gitignore
├── README.md
├── public/                            # static assets
│   └── favicon.svg
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── layout.tsx                 # root layout, global CSS
│   │   ├── page.tsx                   # job list (server component)
│   │   ├── globals.css
│   │   ├── new/
│   │   │   └── page.tsx               # brief form (client component)
│   │   ├── jobs/[jobId]/
│   │   │   ├── page.tsx               # job detail (server)
│   │   │   ├── loading.tsx
│   │   │   └── render-client.tsx      # live progress (client)
│   │   └── api/
│   │       ├── jobs/
│   │       │   ├── route.ts           # GET (list), POST (create)
│   │       │   └── [jobId]/
│   │       │       ├── route.ts       # GET (job)
│   │       │       ├── script/route.ts       # GET script.json
│   │       │       ├── prompts/route.ts      # GET prompts.md
│   │       │       ├── render/route.ts       # POST (SSE progress)
│   │       │       └── video/[segId]/route.ts # PUT (upload video)
│   ├── domain/                        # pure Effect business logic
│   │   ├── script/
│   │   │   ├── schema.ts              # Effect Schema for Script
│   │   │   ├── service.ts             # ScriptService (Effect.Service)
│   │   │   ├── llm.ts                 # MiniMax HTTP client (Effect)
│   │   │   ├── prompts.ts             # system + user prompt builders
│   │   │   └── validation.ts          # cross-field checks
│   │   ├── tts/
│   │   │   ├── service.ts             # TtsService (Effect)
│   │   │   ├── emotion.ts             # mood → emotion
│   │   │   └── client.ts              # MiniMax TTS HTTP client
│   │   ├── callouts/
│   │   │   ├── ass.ts                 # Script → callouts.ass
│   │   │   └── validation.ts
│   │   ├── compose/
│   │   │   ├── service.ts             # ComposeService
│   │   │   └── ffmpeg.ts              # ffmpeg wrapper
│   │   ├── jobs/
│   │   │   ├── service.ts             # JobService (lifecycle)
│   │   │   ├── storage.ts             # file paths, read/write
│   │   │   ├── slug.ts
│   │   │   └── events.ts              # typed render progress events
│   │   └── lib/
│   │       ├── config.ts              # Effect Config for env
│   │       ├── retry.ts               # Schedule.exponential presets
│   │       ├── logger.ts              # Effect Logger
│   │       └── errors.ts              # tagged error types
│   ├── components/                    # React UI
│   │   ├── brief-form.tsx             # client: story type, theme, length
│   │   ├── job-list.tsx               # client: list + filters
│   │   ├── job-card.tsx
│   │   ├── job-detail.tsx             # client: tabs (script / prompts / videos / progress)
│   │   ├── prompts-viewer.tsx         # renders prompts.md with copy buttons
│   │   ├── video-checklist.tsx        # client: per-segment upload status
│   │   ├── video-uploader.tsx         # client: drag-drop / file picker
│   │   ├── progress-feed.tsx          # client: live SSE progress
│   │   └── ui/
│   │       ├── button.tsx
│   │       ├── input.tsx
│   │       ├── card.tsx
│   │       ├── progress.tsx
│   │       └── badge.tsx
│   └── lib/
│       ├── runtime.ts                 # ManagedRuntime for Server Actions
│       ├── client.ts                  # typed client for fetchers
│       └── format.ts                  # duration, file size, etc.
├── outputs/                           # generated jobs (gitignored)
└── tests/                             # vitest + Effect testing
    ├── script.test.ts
    ├── callouts.test.ts
    └── compose.test.ts
```

---

## 5. Data Contracts (Effect Schema)

```ts
// src/domain/script/schema.ts
import { Schema } from "effect"

export const StoryType = Schema.Literal("nosleep", "creepypasta", "mystic", "rules", "imagine")
export const AspectRatio = Schema.Literal("9:16", "16:9", "1:1")
export const CalloutAnchor = Schema.Literal("top", "middle", "lower")
export const CalloutStyle = Schema.Literal("pop", "fade", "slide-up")
export const CalloutEmphasis = Schema.Literal("normal", "strong")
export const Lang = Schema.Literal("vi", "en")

export const Callout = Schema.Struct({
  text: Schema.String.pipe(Schema.minLength(2), Schema.maxLength(80)),
  startFraction: Schema.Number.pipe(Schema.between(0, 1)),
  endFraction: Schema.Number.pipe(Schema.between(0, 1)),
  anchor: CalloutAnchor,
  style: CalloutStyle,
  emphasis: CalloutEmphasis,
})

export const VisualCue = Schema.Struct({
  prompt: Schema.String.pipe(Schema.minLength(20)),
  mood: Schema.String,
  styleAnchor: Schema.optional(Schema.String),
  durationHint: Schema.Number.pipe(Schema.between(2, 8)),
  aspectRatio: AspectRatio,
  notesForHuman: Schema.optional(Schema.String),
})

export const Segment = Schema.Struct({
  id: Schema.String.pipe(Schema.pattern(/^seg-\d{3}$/)),
  text: Schema.String.pipe(Schema.minLength(10)),
  approxDuration: Schema.Number.pipe(Schema.between(2, 20)),
  visual: VisualCue,
  callouts: Schema.Array(Callout).pipe(Schema.maxLength(3)),
})

export const Script = Schema.Struct({
  title: Schema.String,
  storyType: StoryType,
  lang: Lang,
  aspectRatio: AspectRatio,
  hook: Schema.String,
  styleAnchor: Schema.String,
  ttsVoiceHint: Schema.optional(Schema.String),
  totalDuration: Schema.Number,
  segments: Schema.Array(Segment).pipe(Schema.minLength(3), Schema.maxLength(20)),
})

export const BriefInput = Schema.Struct({
  storyType: StoryType,
  theme: Schema.String,
  lengthMinutes: Schema.Number.pipe(Schema.between(0.5, 15)),
  aspectRatio: Schema.optional(AspectRatio),
  lang: Schema.optional(Lang),
  voice: Schema.optional(Schema.String),
  styleAnchor: Schema.optional(Schema.String),
})
```

The same Schema is used for:
- Runtime validation of LLM output
- Static types (`type Script = Schema.Schema.Type<typeof Script>`)
- OpenAPI generation (later, via `@effect/platform-http`)

---

## 6. Domain Services (Effect)

```ts
// src/domain/script/service.ts
import { Effect, Layer, Schedule, Schema } from "effect"
import { BriefInput, Script } from "./schema"
import { LLMService, LLMError } from "./llm"
import { buildSystemPrompt, buildUserPrompt } from "./prompts"

export class ScriptService extends Effect.Service<ScriptService>()(
  "app/ScriptService",
  {
    effect: Effect.gen(function* () {
      const llm = yield* LLMService
      const cfg = yield* ScriptConfig

      const generate = (input: BriefInput) =>
        Effect.gen(function* () {
          const raw = yield* llm.completeJSON({
            system: buildSystemPrompt(input.storyType),
            user: buildUserPrompt(input),
          }).pipe(
            Effect.retry(Schedule.exponential("500 millis").pipe(
              Schedule.compose(Schedule.recurs(3)),
              Schedule.intersect(Schedule.elapsed),
            )),
            Effect.timeout("90 seconds"),
            Effect.tapError(e => Effect.logError("LLM failed", e)),
          )

          // Schema decode is itself an Effect — invalid output is a typed error
          const script = yield* Schema.decodeUnknown(Script)(raw).pipe(
            Effect.mapError(e => new ValidationError({ message: "Script schema mismatch", cause: e })),
          )

          // Cross-field check: totalDuration within tolerance
          yield* validateTotalDuration(script, input.lengthMinutes)

          return script
        })

      return { generate } as const
    }),
    dependencies: [LLMService.Default],
  }
) {}
```

```ts
// src/domain/tts/service.ts
export class TtsService extends Effect.Service<TtsService>()(
  "app/TtsService",
  {
    effect: Effect.gen(function* () {
      const client = yield* MiniMaxTtsClient

      const synthesizeSegment = (seg: Segment, outPath: string) =>
        Effect.gen(function* () {
          const emotion = emotionForMood(seg.visual.mood)
          const audio = yield* client.synthesize({
            text: seg.text,
            voiceId: yield* config.string("MINIMAX_VOICE_ID"),
            emotion,
            speed: yield* config.number("MINIMAX_DEFAULT_SPEED"),
          })
          yield* fs.writeFile(outPath, audio)
          return outPath
        })

      const synthesizeAll = (segments: Segment[], outDir: string, concurrency = 3) =>
        Effect.forEach(segments, (seg) =>
          synthesizeSegment(seg, path.join(outDir, `${seg.id}.mp3`)),
          { concurrency, discard: true },
        )

      return { synthesizeSegment, synthesizeAll } as const
    }),
  }
) {}
```

```ts
// src/domain/jobs/service.ts
export type RenderEvent =
  | { type: "started"; jobId: string; totalSegments: number }
  | { type: "tts-start"; segmentId: string; index: number }
  | { type: "tts-done"; segmentId: string; duration: number }
  | { type: "tts-error"; segmentId: string; message: string }
  | { type: "compose-start"; totalPacks: number }
  | { type: "compose-pack-done"; index: number }
  | { type: "compose-done"; outPath: string; duration: number }
  | { type: "done"; outPath: string }
  | { type: "error"; message: string }

export const renderJob = (jobId: string): Stream<RenderEvent, never, JobService> =>
  Stream.fromEffect(getJob(jobId)).pipe(
    Stream.flatMap(job =>
      Stream.fromIterable([
        { type: "started", jobId, totalSegments: job.script.segments.length } as RenderEvent,
        ...ttsEventsFor(job),
        ...composeEventsFor(job),
        { type: "done", outPath: finalPath(job) } as RenderEvent,
      ])
    )
  )
```

The SSE route handler:
```ts
// src/app/api/jobs/[jobId]/render/route.ts
export async function POST(_req: Request, { params }: { params: { jobId: string } }) {
  const stream = runtime.runSyncStream(renderJob(params.jobId).pipe(
    Stream.tap(event => Effect.logInfo("render event", event))
  ))
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
```

---

## 7. UI Pages

```
/                       → list all jobs (server component, with filters)
/new                    → brief form (client component, calls Server Action)
/jobs/[jobId]           → job detail (server shell + client islands):
                          ├── Script tab: pretty-printed Script
                          ├── Prompts tab: rendered prompts.md with copy buttons
                          ├── Videos tab: upload + checklist
                          └── Render tab: live progress (SSE), final.mp4 link
```

**Server Actions** (called from client components):
- `createBrief(input)` — runs LLM, writes job folder, returns jobId
- `uploadVideo(jobId, segId, file)` — writes to videos/{segId}.mp4
- `startRender(jobId)` — kicks off the render fiber (returns the stream URL)

**Live progress** is plain SSE — no third-party library, no WebSocket complexity.

---

## 8. Configuration (.env.example)

```env
# ---------- MiniMax (one key, two services) ----------
MINIMAX_API_KEY=

# LLM
MINIMAX_LLM_URL=https://api.MiniMax.chat/v1
MINIMAX_LLM_MODEL=MiniMax-Text-01
MINIMAX_LLM_TEMPERATURE=0.8

# TTS
MINIMAX_TTS_URL=https://api.MiniMax.io/v1/tts
MINIMAX_TTS_MODEL=speech-2.6-hd
MINIMAX_VOICE_ID=male-qn-jingying
MINIMAX_DEFAULT_EMOTION=neutral
MINIMAX_DEFAULT_SPEED=0.95

# ---------- Pipeline ----------
GOOGLE_VISUAL_BACKEND=manual
DEFAULT_LANG=vi
DEFAULT_ASPECT=9:16
PIPELINE_CONCURRENCY=3
OUTPUT_DIR=./outputs
LOG_LEVEL=info

# ---------- Optional (for v2 auto mode) ----------
GOOGLE_GEMINI_API_KEY=
GOOGLE_OMNI_MODEL=veo-2.0-generate-001
```

---

## 9. Cost & Time Budget (per 4-min video, manual mode)

| Step        | Who                       | Cost      | Time              |
| ----------- | ------------------------- | --------- | ----------------- |
| Script      | MiniMax LLM               | ~$0.05    | 10-20s            |
| Prompts     | (free, derived from LLM)  | $0        | (included)        |
| TTS         | MiniMax                   | ~$0.30    | 30-60s            |
| Videos      | **You + Gemini chat**     | $0*       | 5-15 min          |
| Compose     | ffmpeg (local)            | $0        | 10-20s            |
| **Total**   |                           | **~$0.35**| **~6-16 min**     |

*Gemini videos are covered by your consumer plan. We pay only for LLM + TTS, both via the same MiniMax key.

---

## 10. Build Order (5-7 days)

| Day | Deliverable                                                                              |
| --- | ---------------------------------------------------------------------------------------- |
| 1   | Repo skeleton (Bun + Next.js + Oxc configs), Effect Schema for Script, MiniMax LLM client, `brief` Server Action, basic `/new` form |
| 2   | All 5 story-type prompt templates + golden-file tests, cross-field validation            |
| 3   | TtsService + ComposeService + ffmpeg wrapper + JobService, render orchestrator            |
| 4   | SSE progress stream, progress feed component, render button + final.mp4 link              |
| 5   | `/jobs/[jobId]` detail page (tabs), video upload via PUT route, prompts.md viewer with copy buttons |
| 6   | Polish: job list, filters, badges, error UX, README                                       |
| 7   | Smoke test: full E2E for `nosleep` from UI → final.mp4                                    |

---

## 11. Risks & Mitigations

| Risk                                          | Mitigation                                                          |
| --------------------------------------------- | ------------------------------------------------------------------- |
| MiniMax LLM hallucinates structure            | Effect Schema decode is a typed error; re-prompt with corrective note |
| MiniMax `json_object` mode adds garbage keys   | Zod-style `additionalProperties: false` baked into the prompt       |
| MiniMax rate limits                           | `Schedule.exponential` retry on 429, surfacing clean error to UI    |
| Manual videos look inconsistent               | `styleAnchor` prepended to every prompt; UI tells user to keep ONE Gemini chat |
| Effect learning curve                         | Patterns are centralized; service templates are copy-paste; comments on every effect block |
| Bun + Next.js edge cases                       | We use `bun run` (which still invokes Node) by default; `bun --bun next` only if it works |
| LLM output in Vietnamese has wrong dialect    | Prompt explicitly says "Northern dialect" for `vi`                   |
| Video duration doesn't match narration        | UI shows duration on each uploaded file; warn if mismatch >20%      |
| SSE drops mid-render                           | Client auto-reconnects, server replays from last persisted checkpoint (v2) |

---

## 12. Future Hooks (post-v1)

- `auto` / `hybrid` modes (when you get Veo API access)
- `remix` mode: same script, new media
- Auto-thumbnailer (Imagen first-frame → text overlay)
- Music bed generator (Suno or MiniMax music)
- Auto-publisher to YouTube Shorts / TikTok
- Branching for `imagine` stories
- Auth + multi-user (NextAuth + SQLite via Bun)
- WebSocket progress (instead of SSE) for sub-second updates

---

## 13. Open Questions

1. **Aspect ratio** — 9:16 (Shorts/TikTok). Resolved ✅
2. **Visual mode** — `manual` (current plan). Resolved ✅
3. **Voice** — MiniMax `male-qn-jingying` (trầm ấm, nam). Resolved ✅
4. **Callouts** — motion text overlay, not captions. Resolved ✅
5. **Duration reconciliation** — freeze last frame (default).
6. **One Gemini chat thread** — default. Style anchor prepended.
7. **LLM choice** — MiniMax (per your latest change). Resolved ✅
8. **Effect scope** — full Effect for domain, plain React/Next.js for UI. Resolved ✅
9. **Single-user local app** — confirm no auth needed for v1.
