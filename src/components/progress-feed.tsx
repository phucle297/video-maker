/**
 * ProgressFeed — renders the live SSE event log.
 */

"use client";

import type { RenderEvent } from "@/domain/jobs/events";
import { formatDuration } from "@/lib/format";

export function ProgressFeed({ events }: { events: RenderEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="faint" style={{ fontSize: "0.85rem", textAlign: "center", padding: "1.5rem" }}>
        No events yet. Click Render to start.
      </p>
    );
  }

  return (
    <div
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        padding: "0.5rem",
        maxHeight: 400,
        overflowY: "auto",
        fontFamily: "var(--font-mono)",
        fontSize: "0.82rem",
      }}
    >
      {events.map((event, i) => (
        <EventLine key={i} event={event} />
      ))}
    </div>
  );
}

function EventLine({ event }: { event: RenderEvent }) {
  const time = new Date().toLocaleTimeString();
  switch (event.type) {
    case "started":
      return (
        <Line time={time} color="var(--accent)">
          ▶ started · {event.totalSegments} segments
        </Line>
      );
    case "tts":
      return (
        <Line
          time={time}
          color={
            event.status === "done"
              ? "var(--success)"
              : event.status === "error"
                ? "var(--error)"
                : "var(--text-dim)"
          }
        >
          🔊 TTS {event.status} · {event.segmentId} ({event.index + 1})
          {event.durationSec ? ` · ${formatDuration(event.durationSec)}` : ""}
          {event.message ? ` · ${event.message}` : ""}
        </Line>
      );
    case "compose":
      return (
        <Line
          time={time}
          color={
            event.status === "done"
              ? "var(--success)"
              : event.status === "error" || event.status === "pack-error"
                ? "var(--error)"
                : "var(--text-dim)"
          }
        >
          🎬 compose {event.status}
          {event.current && event.total ? ` · ${event.current}/${event.total}` : ""}
          {event.message ? ` · ${event.message}` : ""}
          {event.durationSec ? ` · ${formatDuration(event.durationSec)}` : ""}
        </Line>
      );
    case "done":
      return (
        <Line time={time} color="var(--success)">
          ✓ done · {event.outPath} · {formatDuration(event.durationSec)}
        </Line>
      );
    case "error":
      return (
        <Line time={time} color="var(--error)">
          ✗ error{event.fatal ? " (fatal)" : ""} · {event.message}
        </Line>
      );
  }
}

function Line({
  time,
  color,
  children,
}: {
  time: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ padding: "0.15rem 0.5rem", color }}>
      <span className="faint" style={{ marginRight: "0.5rem" }}>
        {time}
      </span>
      {children}
    </div>
  );
}
