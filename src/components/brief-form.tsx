/**
 * BriefForm — client component for /new.
 * Calls createBrief Server Action, redirects to the job page on success.
 */

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrief } from "@/lib/actions";

const STORY_TYPES = [
  {
    value: "nosleep",
    label: "r/nosleep",
    hint: "First-person horror, present tense",
  },
  {
    value: "creepypasta",
    label: "Creepypasta",
    hint: "Atmospheric, supernatural",
  },
  { value: "mystic", label: "Mystic", hint: "Second-person, dreamlike" },
  { value: "rules", label: "Rules", hint: "Listicle count-up reveal" },
  { value: "imagine", label: "Imagine", hint: "Choose-your-path (linear v1)" },
] as const;

const ASPECTS = [
  { value: "9:16", label: "9:16 (Shorts / TikTok)" },
  { value: "16:9", label: "16:9 (YouTube)" },
  { value: "1:1", label: "1:1 (Instagram)" },
] as const;

const LANGS = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
] as const;

export function BriefForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [storyType, setStoryType] = useState("nosleep");
  const [theme, setTheme] = useState("");
  const [lengthMinutes, setLengthMinutes] = useState(4);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [lang, setLang] = useState("vi");
  const [voice, setVoice] = useState("English_causual_narrator_vv1");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createBrief({
        storyType,
        theme,
        lengthMinutes,
        aspectRatio,
        lang,
        voice,
      });
      if (result.ok) {
        router.push(`/jobs/${result.jobId}`);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: "1.25rem" }}>
      <div>
        <label
          style={{ display: "block", marginBottom: "0.4rem", fontWeight: 500 }}
        >
          Story type
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "0.5rem",
          }}
        >
          {STORY_TYPES.map((st) => (
            <button
              key={st.value}
              type="button"
              onClick={() => setStoryType(st.value)}
              className={storyType === st.value ? "btn" : "btn btn-secondary"}
              style={{
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "0.6rem 0.8rem",
              }}
            >
              <span style={{ fontWeight: 600 }}>{st.label}</span>
              <span className="faint" style={{ fontSize: "0.78rem" }}>
                {st.hint}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label
          htmlFor="theme"
          style={{ display: "block", marginBottom: "0.4rem", fontWeight: 500 }}
        >
          Theme / topic
        </label>
        <input
          id="theme"
          required
          minLength={3}
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="e.g. abandoned hotel on a mountain, night shift worker, mysterious rules for the night shift…"
        />
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
      >
        <div>
          <label
            htmlFor="length"
            style={{
              display: "block",
              marginBottom: "0.4rem",
              fontWeight: 500,
            }}
          >
            Target length (minutes)
          </label>
          <input
            id="length"
            type="number"
            min={0.5}
            max={15}
            step={0.5}
            value={lengthMinutes}
            onChange={(e) => setLengthMinutes(parseFloat(e.target.value))}
          />
        </div>
        <div>
          <label
            htmlFor="aspect"
            style={{
              display: "block",
              marginBottom: "0.4rem",
              fontWeight: 500,
            }}
          >
            Aspect ratio
          </label>
          <select
            id="aspect"
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
          >
            {ASPECTS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
      >
        <div>
          <label
            htmlFor="lang"
            style={{
              display: "block",
              marginBottom: "0.4rem",
              fontWeight: 500,
            }}
          >
            Language
          </label>
          <select
            id="lang"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          >
            {LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="voice"
            style={{
              display: "block",
              marginBottom: "0.4rem",
              fontWeight: 500,
            }}
          >
            TTS voice
          </label>
          <input
            id="voice"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            placeholder="MiniMax voice id (e.g. English_causual_narrator_vv1)"
          />
        </div>
      </div>

      {error && (
        <div
          className="card"
          style={{
            background: "rgba(248, 113, 113, 0.05)",
            borderColor: "rgba(248, 113, 113, 0.3)",
            color: "var(--error)",
            fontSize: "0.9rem",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}
      >
        <button type="submit" className="btn" disabled={pending || !theme}>
          {pending ? "Generating script…" : "Generate script"}
        </button>
      </div>
    </form>
  );
}
