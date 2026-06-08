/**
 * ScriptViewer — pretty-prints the Script object.
 */

"use client";

import type { Script } from "@/domain/script/schema";
import { formatDuration } from "@/lib/format";

export function ScriptViewer({ script }: { script: Script }) {
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="card">
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>{script.title}</h2>
        <p className="muted" style={{ fontStyle: "italic" }}>
          "{script.hook}"
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
          <span className="badge badge-accent">{script.storyType}</span>
          <span className="badge">{script.lang}</span>
          <span className="badge">{script.aspectRatio}</span>
          <span className="badge">~{formatDuration(script.totalDuration)}</span>
          <span className="badge">{script.segments.length} segments</span>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>Style anchor</h3>
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          {script.styleAnchor}
        </p>
      </div>

      <div>
        <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Segments</h3>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {script.segments.map((seg, i) => (
            <div key={seg.id} className="card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: "0.5rem",
                }}
              >
                <strong>
                  {i + 1}. {seg.id}
                </strong>
                <span className="faint" style={{ fontSize: "0.85rem" }}>
                  ~{formatDuration(seg.approxDuration)}
                </span>
              </div>
              <p style={{ margin: "0 0 0.75rem 0" }}>{seg.text}</p>
              {seg.callouts.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.4rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  {seg.callouts.map((co, j) => (
                    <span
                      key={j}
                      className={co.emphasis === "strong" ? "badge badge-accent" : "badge"}
                    >
                      {co.text}
                    </span>
                  ))}
                </div>
              )}
              <details>
                <summary className="faint" style={{ fontSize: "0.85rem", cursor: "pointer" }}>
                  Visual prompt
                </summary>
                <pre style={{ marginTop: "0.5rem", fontSize: "0.82rem" }}>{seg.visual.prompt}</pre>
              </details>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
