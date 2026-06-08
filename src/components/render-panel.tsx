/**
 * RenderPanel — start the render and show live progress via SSE.
 */

"use client";

import { useState } from "react";
import { ProgressFeed } from "./progress-feed";
import type { RenderEvent } from "@/domain/jobs/events";

interface Props {
  jobId: string;
  allUploaded: boolean;
  finalExists: boolean;
  finalPath: string;
}

export function RenderPanel({ jobId, allUploaded, finalExists, finalPath }: Props) {
  const [events, setEvents] = useState<RenderEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setEvents([]);
    setError(null);
    setRunning(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/render`, { method: "POST" });
      if (!res.ok || !res.body) {
        setError(`Failed to start: ${res.status}`);
        setRunning(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6)) as RenderEvent;
              setEvents((prev) => [...prev, event]);
              if (event.type === "done" || (event.type === "error" && event.fatal)) {
                setRunning(false);
              }
            } catch {
              // ignore malformed
            }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const lastEvent = events[events.length - 1];
  const isDone = lastEvent?.type === "done";

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="card">
        {!allUploaded && (
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(250, 204, 21, 0.08)",
              border: "1px solid rgba(250, 204, 21, 0.3)",
              borderRadius: "var(--radius-sm)",
              color: "var(--warning)",
              fontSize: "0.9rem",
              marginBottom: "1rem",
            }}
          >
            ⚠ Not all videos are uploaded. Render will fail until all segments have videos.
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "1rem", margin: 0 }}>Render</h3>
          <button
            className="btn"
            onClick={start}
            disabled={running || !allUploaded}
          >
            {running ? "Rendering…" : isDone || finalExists ? "Re-render" : "Render"}
          </button>
        </div>

        {isDone && lastEvent?.type === "done" && (
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(74, 222, 128, 0.08)",
              border: "1px solid rgba(74, 222, 128, 0.3)",
              borderRadius: "var(--radius-sm)",
              color: "var(--success)",
              marginBottom: "1rem",
            }}
          >
            ✓ Done! Download:{" "}
            <a href={`/api/jobs/${jobId}/final`} style={{ color: "inherit", textDecoration: "underline" }}>
              final.mp4
            </a>
          </div>
        )}

        {error && (
          <div style={{ color: "var(--error)", fontSize: "0.9rem", marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        <ProgressFeed events={events} />
      </div>
    </div>
  );
}
