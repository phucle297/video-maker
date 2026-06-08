/**
 * VideoChecklist — list of segments with upload buttons.
 * On upload, PUTs to the API and updates local state.
 */

"use client";

import { useState } from "react";
import type { Segment } from "@/domain/script/schema";
import type { VideoStatus } from "@/domain/jobs/service";
import { formatDuration } from "@/lib/format";

interface Props {
  jobId: string;
  segments: Segment[];
  videos: VideoStatus[];
  onChange: (videos: VideoStatus[]) => void;
}

export function VideoChecklist({ jobId, segments, videos, onChange }: Props) {
  return (
    <div>
      <p className="muted" style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
        Upload one video per segment. The aspect ratio should match the script
        ({segments[0]?.visual.aspectRatio ?? "9:16"}). Recommended clip length:
        6-8 seconds.
      </p>

      <div style={{ display: "grid", gap: "0.5rem" }}>
        {segments.map((seg, i) => {
          const v = videos[i];
          return (
            <VideoRow
              key={seg.id}
              jobId={jobId}
              seg={seg}
              status={v}
              onUploaded={(newStatus) => {
                const next = videos.slice();
                next[i] = newStatus;
                onChange(next);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function VideoRow({
  jobId,
  seg,
  status,
  onUploaded,
}: {
  jobId: string;
  seg: Segment;
  status: VideoStatus;
  onUploaded: (s: VideoStatus) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/jobs/${jobId}/video/${seg.id}`, {
        method: "PUT",
        body: fd,
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "upload failed");
      onUploaded({
        ...status,
        uploaded: true,
        expectedPath: status.expectedPath,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "0.75rem 1rem",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          background: status.uploaded ? "var(--success)" : "var(--bg-elev-2)",
          color: status.uploaded ? "#001" : "var(--text-dim)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 600,
          fontSize: "0.85rem",
        }}
      >
        {status.uploaded ? "✓" : ""}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
          <strong>{seg.id}</strong>
          <span className="faint" style={{ fontSize: "0.85rem" }}>
            ~{formatDuration(seg.approxDuration)} · mood: {seg.visual.mood}
          </span>
        </div>
        <div className="muted" style={{ fontSize: "0.88rem", marginTop: "0.15rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {seg.text}
        </div>
        {error && (
          <div style={{ color: "var(--error)", fontSize: "0.82rem", marginTop: "0.25rem" }}>
            {error}
          </div>
        )}
      </div>

      <label
        className={uploading ? "btn" : "btn btn-secondary"}
        style={{ margin: 0, cursor: uploading ? "wait" : "pointer" }}
      >
        {uploading ? "Uploading…" : status.uploaded ? "Replace" : "Upload"}
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
          style={{ display: "none" }}
        />
      </label>
    </div>
  );
}
