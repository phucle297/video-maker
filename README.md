# Story Video Factory

> Full-stack web app: idea → script (MiniMax LLM) → video prompts (you + Gemini chat) → voice (MiniMax TTS) → merge → final MP4

Built with **Bun + TypeScript + [Effect](https://effect.website/) + Next.js 15 + Oxc**. Designed for creators with a **MiniMax** subscription (LLM + TTS via one key) and a **Google Gemini** consumer plan (videos via chat only).

## Quick start

```bash
bun install
cp .env.example .env
# fill in MINIMAX_API_KEY

bun run dev
# open http://localhost:3000
```

Then:
1. **New Brief** → fill in story type, theme, length → submit.
2. **Prompts tab** → copy each prompt into Gemini chat, download the video.
3. **Videos tab** → upload each clip.
4. **Render tab** → hit render, watch live progress, download `final.mp4`.

## Stack

| Layer          | Choice                       |
| -------------- | ---------------------------- |
| Runtime        | Bun 1.x                      |
| Framework      | Next.js 15 (App Router)      |
| Effects/Schema | Effect 3.x                   |
| UI             | React 19 + plain CSS         |
| LLM            | MiniMax (json_object mode)   |
| TTS            | MiniMax HTTP                 |
| Lint/Format    | oxlint + oxfmt               |
| Video          | ffmpeg                       |

See `PLAN.md` for the full design.

## Project structure

```
src/
├── app/         # Next.js App Router (UI + API routes)
├── domain/      # Pure Effect business logic
├── components/  # React UI components
└── lib/         # Runtime + utilities
```

## Scripts

```bash
bun run dev         # Next.js dev server
bun run build       # production build
bun run start       # production server
bun run typecheck   # tsc --noEmit
bun run lint        # oxlint
bun run fmt         # oxfmt
bun run test        # vitest
```

## Output layout (per job)

```
outputs/{jobId}/
├── script.json     # structured Script
├── prompts.md      # read this, generate videos
├── README.md
├── videos/         # YOU upload here
├── voice/          # system writes TTS here
├── callouts.ass    # motion text overlay
└── final.mp4       # the finished video
```
