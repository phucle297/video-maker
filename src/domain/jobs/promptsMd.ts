/**
 * Renders a Script → human-readable prompts.md.
 * The user opens this file in the UI, copies each prompt into Gemini chat,
 * downloads the video, drops it in videos/<segId>.mp4.
 */

import type { Script } from "../script/schema.js";

function aspectInstruction(ar: string): string {
  if (ar === "9:16") return "vertical 9:16 (1080x1920)";
  if (ar === "16:9") return "horizontal 16:9 (1920x1080)";
  return "square 1:1 (1080x1080)";
}

export function renderPromptsMd(script: Script, jobId: string): string {
  const aspect = aspectInstruction(script.aspectRatio);
  const lines: string[] = [];

  lines.push(`# Video Prompts — "${script.title}"`);
  lines.push("");
  lines.push(`> **Story type:** ${script.storyType}  `);
  lines.push(`> **Language:** ${script.lang}  `);
  lines.push(`> **Aspect ratio:** ${aspect}  `);
  lines.push(`> **Total target duration:** ${Math.round(script.totalDuration)}s (~${Math.round(script.totalDuration / 60)} min)  `);
  lines.push(`> **Total segments:** ${script.segments.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## How to use this file");
  lines.push("");
  lines.push("1. Open **Google Gemini** (gemini.google.com) in your browser.");
  lines.push("2. For each segment below, copy the **Visual prompt** block, paste it into Gemini chat, and ask for a video clip.");
  lines.push(`3. **Be explicit** in your ask: "Generate a ${aspect} video clip, ~${script.segments[0]?.visual.durationHint ?? 6} seconds".`);
  lines.push("4. Download the result.");
  lines.push("5. Save it as `videos/<segmentId>.mp4` (the exact filename is listed under each segment).");
  lines.push("6. When ALL videos are in, click **Render** in the UI.");
  lines.push("");
  lines.push("### Tips for visual consistency");
  lines.push("");
  lines.push("- **Keep ONE Gemini chat thread** open across all segments. The model will pick up the visual style from earlier turns.");
  lines.push(`- **Style anchor** (prepended to every prompt): ${script.styleAnchor}`);
  lines.push(`- If a clip looks off, regenerate it in the same chat with feedback like "darker, more rain" — it usually nails it on the 2nd try.`);
  lines.push(`- If Gemini refuses a prompt (safety filter on horror content), rephrase the prompt to be more abstract / less gory. The narration still carries the story.`);
  lines.push("");
  lines.push("---");
  lines.push("");

  let t = 0;
  for (let i = 0; i < script.segments.length; i++) {
    const seg = script.segments[i];
    const start = t;
    const end = t + seg.approxDuration;
    const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

    lines.push(`## Segment ${i + 1} / ${script.segments.length} — ${mm(start)} → ${mm(end)}`);
    lines.push("");
    lines.push("**Narration:**");
    lines.push(`> ${seg.text}`);
    lines.push("");
    if (seg.callouts.length > 0) {
      lines.push("**On-screen callouts (auto-rendered, just FYI):**");
      for (const co of seg.callouts) {
        lines.push(`- \`${co.text}\` (${co.anchor}, ${co.style}, ${co.emphasis})`);
      }
      lines.push("");
    }
    lines.push("**Visual prompt — paste this into Gemini chat:**");
    lines.push("");
    lines.push("```");
    const prompt = buildFullPrompt(script.styleAnchor, seg.visual.prompt, seg.visual.notesForHuman);
    lines.push(prompt);
    lines.push("```");
    lines.push("");
    lines.push("**Gemini request template** (paste AFTER the visual prompt):");
    lines.push("");
    lines.push(`> Generate a ${aspect} video clip, ~${seg.visual.durationHint} seconds. ${seg.visual.notesForHuman ?? ""}`);
    lines.push("");
    lines.push(`**Save the generated video as:** \`videos/${seg.id}.mp4\``);
    lines.push("");
    lines.push("---");
    lines.push("");

    t = end;
  }

  lines.push("");
  lines.push("## Checklist");
  lines.push("");
  for (const seg of script.segments) {
    lines.push(`- [ ] videos/${seg.id}.mp4`);
  }
  lines.push("");
  lines.push("When all boxes are checked, click **Render** in the UI.");
  lines.push("");

  return lines.join("\n");
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
