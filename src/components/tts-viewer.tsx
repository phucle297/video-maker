/**
 * TtsViewer — narration-only view of the script.
 *
 * Shows exactly the text that will be sent to the TTS API per segment,
 * along with the voice that will be used and the cumulative read time.
 * Use this to proofread the script before triggering render.
 */

"use client";

import { useState } from "react";
import type { Script, Segment } from "@/domain/script/schema";
import { formatDuration } from "@/lib/format";

export function TtsViewer({ script }: { script: Script }) {
  const [copied, setCopied] = useState(false);
  const voice = script.ttsVoiceHint ?? "(env default)";
  const totalWords = script.segments.reduce(
    (sum: number, seg: Segment) => sum + seg.text.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
  const totalChars = script.segments.reduce(
    (sum: number, seg: Segment) => sum + seg.text.length,
    0,
  );

  const buildPlainText = () =>
    script.segments
      .map((seg: Segment, i: number) => `[${i + 1}/${script.segments.length}] ${seg.id}\n${seg.text}`)
      .join("\n\n");

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; silent
    }
  };

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Narration</h2>
            <div
              className="faint"
              style={{ fontSize: "0.85rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}
            >
              <span>
                Voice: <strong style={{ color: "var(--text)" }}>{voice}</strong>
              </span>
              <span>~{formatDuration(script.totalDuration)}</span>
              <span>
                {script.segments.length} segments · {totalWords.toLocaleString()} words ·{" "}
                {totalChars.toLocaleString()} chars
              </span>
            </div>
          </div>
          <button
            onClick={copyAll}
            className="btn"
            style={{ padding: "0.4rem 0.9rem", fontSize: "0.85rem" }}
          >
            {copied ? "Copied ✓" : "Copy all"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {script.segments.map((seg: Segment, i: number) => (
          <div key={seg.id} className="card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "0.5rem",
              }}
            >
              <strong style={{ fontSize: "0.95rem" }}>
                {i + 1}. {seg.id}
              </strong>
              <span className="faint" style={{ fontSize: "0.85rem" }}>
                ~{formatDuration(seg.approxDuration)} ·{" "}
                {seg.text.trim().split(/\s+/).filter(Boolean).length} words
              </span>
            </div>
            <p style={{ margin: 0, lineHeight: 1.5 }}>{seg.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
