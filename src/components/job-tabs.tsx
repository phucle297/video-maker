/**
 * JobTabs — the 4-tab UI for a job: Script | Prompts | Videos | Render.
 *
 * Client component because it has tab state and live progress.
 */

"use client";

import { useState } from "react";
import type { Script } from "@/domain/script/schema";
import type { VideoStatus } from "@/domain/jobs/service";
import { ScriptViewer } from "./script-viewer";
import { PromptsViewer } from "./prompts-viewer";
import { VideoChecklist } from "./video-checklist";
import { RenderPanel } from "./render-panel";

interface Props {
  jobId: string;
  script: Script;
  videos: VideoStatus[];
  allUploaded: boolean;
  finalExists: boolean;
  finalPath: string;
}

type Tab = "script" | "prompts" | "videos" | "render";

export function JobTabs({ jobId, script, videos, allUploaded, finalExists, finalPath }: Props) {
  const [tab, setTab] = useState<Tab>("script");
  const [videosState, setVideosState] = useState<VideoStatus[]>(videos);

  const uploadedCount = videosState.filter((v) => v.uploaded).length;

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          borderBottom: "1px solid var(--border)",
          marginBottom: "1.5rem",
        }}
      >
        <TabButton active={tab === "script"} onClick={() => setTab("script")}>
          Script
        </TabButton>
        <TabButton active={tab === "prompts"} onClick={() => setTab("prompts")}>
          Prompts
        </TabButton>
        <TabButton active={tab === "videos"} onClick={() => setTab("videos")}>
          Videos
          <span className="badge" style={{ marginLeft: "0.5rem" }}>
            {uploadedCount}/{videosState.length}
          </span>
        </TabButton>
        <TabButton active={tab === "render"} onClick={() => setTab("render")}>
          Render
          {finalExists && <span className="badge badge-success" style={{ marginLeft: "0.5rem" }}>done</span>}
        </TabButton>
      </div>

      {tab === "script" && <ScriptViewer script={script} />}
      {tab === "prompts" && <PromptsViewer jobId={jobId} script={script} />}
      {tab === "videos" && (
        <VideoChecklist
          jobId={jobId}
          segments={script.segments}
          videos={videosState}
          onChange={setVideosState}
        />
      )}
      {tab === "render" && (
        <RenderPanel
          jobId={jobId}
          allUploaded={allUploaded}
          finalExists={finalExists}
          finalPath={finalPath}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        color: active ? "var(--text)" : "var(--text-dim)",
        padding: "0.75rem 1.25rem",
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}
