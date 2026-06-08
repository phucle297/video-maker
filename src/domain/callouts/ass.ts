/**
 * Render Script.callouts → ASS (Advanced SubStation Alpha) subtitle file.
 *
 * ASS supports per-line styling, fades (\fad), motion (\move), and
 * scale (\fscx) — exactly what we need for "MrBallen style" pop-up
 * text that highlights KEY information, not full captions.
 *
 * Pure function, no Effects needed (input is fully typed, output is a string).
 */

import type { Callout, CalloutAnchor, CalloutStyle, Script } from "../script/schema.js";

function dimsFor(aspect: string): { w: number; h: number; baseSize: number; strongSize: number } {
  if (aspect === "9:16") return { w: 1080, h: 1920, baseSize: 72, strongSize: 110 };
  if (aspect === "16:9") return { w: 1920, h: 1080, baseSize: 60, strongSize: 88 };
  return { w: 1080, h: 1080, baseSize: 64, strongSize: 96 };
}

function anchorToAssAlign(anchor: CalloutAnchor): number {
  return { top: 8, middle: 5, lower: 2 }[anchor];
}

function marginV(anchor: CalloutAnchor, h: number): number {
  if (anchor === "top") return Math.round(h * 0.1);
  if (anchor === "middle") return 0;
  return Math.round(h * 0.18);
}

function stylePrefix(style: CalloutStyle, durationSec: number, w: number, h: number): string {
  if (style === "pop") {
    return `{\\fscx80\\fscy80\\fad(0,0)\\t(0,150,\\fscx100\\fscy100)\\t(${Math.max(0, Math.round((durationSec - 0.2) * 1000))},${Math.round(durationSec * 1000)},\\fscx80\\fscy80)}`;
  }
  if (style === "fade") {
    return `{\\fad(200,200)}`;
  }
  // slide-up
  return `{\\fad(0,0)\\move(${w / 2},${h},${w / 2},${h - 100})(0,300)}`;
}

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds - Math.floor(seconds)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
}

export function renderCalloutsAss(script: Script): string {
  const { w, h, baseSize, strongSize } = dimsFor(script.aspectRatio);
  const styleName = "Callout";
  const strongStyleName = "CalloutStrong";

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ${styleName},Montserrat,${baseSize},&H00FFFFFF,&H000000FF,&H00101010,&H80000000,1,0,0,0,100,100,0,0,1,5,3,2,80,80,80,1
Style: ${strongStyleName},Montserrat-Black,${strongSize},&H0000E6FF,&H000000FF,&H00101010,&H80000000,1,0,0,0,100,100,0,0,1,6,4,2,80,80,80,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events: string[] = [];
  let t = 0;

  for (const seg of script.segments) {
    const segStart = t;
    const segDur = seg.approxDuration;

    for (const co of seg.callouts) {
      const startSec = segStart + co.startFraction * segDur;
      const endSec = segStart + co.endFraction * segDur;
      const durSec = Math.max(0.4, endSec - startSec);
      const isStrong = co.emphasis === "strong";
      const style = isStrong ? strongStyleName : styleName;
      const mv = marginV(co.anchor, h);
      const animTag = stylePrefix(co.style, durSec, w, h);
      const alignTag = `{\\an${anchorToAssAlign(co.anchor)}\\move(${w / 2},${mv + 100},${w / 2},${mv})}`;
      const text = escapeAssText(co.text);
      const line = `Dialogue: 0,${formatAssTime(startSec)},${formatAssTime(endSec)},${style},,0,0,${mv},,${alignTag}${animTag}${text}`;
      events.push(line);
    }

    t += segDur;
  }

  return header + events.join("\n") + "\n";
}

export function validateCallouts(script: Script): string[] {
  const issues: string[] = [];
  for (const seg of script.segments) {
    const seen = new Set<string>();
    for (const co of seg.callouts) {
      if (co.endFraction <= co.startFraction) {
        issues.push(`${seg.id}: callout "${co.text}" has end <= start`);
      }
      const k = `${co.anchor}-${co.startFraction.toFixed(2)}`;
      if (seen.has(k)) {
        issues.push(`${seg.id}: overlapping callouts on anchor ${co.anchor}`);
      }
      seen.add(k);
    }
  }
  return issues;
}

export type { Callout };
