/**
 * PromptsViewer — loads prompts.md from the API and renders it.
 * Each segment has a "Copy prompt" button.
 */

"use client";

import { useEffect, useState } from "react";
import type { Script, Segment } from "@/domain/script/schema";

interface Props {
  jobId: string;
  script: Script;
}

export function PromptsViewer({ jobId, script }: Props) {
  const [md, setMd] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/prompts`)
      .then((r) => r.text())
      .then(setMd)
      .catch(console.error);
  }, [jobId]);

  if (!md) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div
        className="card"
        style={{
          background: "rgba(0, 230, 255, 0.04)",
          borderColor: "rgba(0, 230, 255, 0.3)",
          marginBottom: "1rem",
          fontSize: "0.9rem",
        }}
      >
        <strong>How to use:</strong> open Google Gemini in one chat tab. For each segment below,
        copy the <strong>Visual prompt</strong>, paste it into Gemini, ask for a{" "}
        {script.aspectRatio} video clip, download, then upload in the <strong>Videos</strong> tab.
      </div>

      {script.segments.map((seg: Segment, i: number) => {
        const promptText = buildFullPrompt(
          script.styleAnchor,
          seg.visual.prompt,
          seg.visual.notesForHuman,
        );
        const startSec = script.segments
          .slice(0, i)
          .reduce((s: number, x: Segment) => s + x.approxDuration, 0);
        const endSec = startSec + seg.approxDuration;
        const mm = (s: number) =>
          `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

        return (
          <div key={seg.id} className="card" style={{ marginBottom: "0.75rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "0.5rem",
              }}
            >
              <strong>
                {i + 1}. {seg.id}{" "}
                <span className="faint" style={{ fontWeight: 400 }}>
                  · {mm(startSec)} → {mm(endSec)}
                </span>
              </strong>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(promptText);
                  setCopiedId(seg.id);
                  setTimeout(() => setCopiedId(null), 1500);
                }}
                style={{ padding: "0.3rem 0.7rem", fontSize: "0.85rem" }}
              >
                {copiedId === seg.id ? "✓ Copied" : "Copy prompt"}
              </button>
            </div>
            <p className="muted" style={{ marginBottom: "0.75rem" }}>
              <em>Narration:</em> {seg.text}
            </p>
            <pre style={{ fontSize: "0.85rem" }}>{promptText}</pre>
          </div>
        );
      })}
    </div>
  );
}

function buildFullPrompt(globalAnchor: string, segPrompt: string, notes?: string): string {
  const parts: string[] = [];
  parts.push(globalAnchor.trim());
  parts.push("");
  parts.push(segPrompt.trim());
  if (notes && notes.trim()) {
    parts.push("");
    parts.push(`Note: ${notes.trim()}`);
  }
  return parts.join("\n");
}
