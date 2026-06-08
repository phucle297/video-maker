/**
 * New Brief page — client component.
 * Fills the form, calls createBrief Server Action, redirects to the job page.
 */

import { BriefForm } from "@/components/brief-form";

export default function NewPage() {
  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: "1.6rem", marginBottom: "0.5rem" }}>New Brief</h1>
      <p className="muted" style={{ marginBottom: "1.5rem" }}>
        Generate a story script + video prompts. The MiniMax LLM will produce a complete
        Script, then you'll generate each video clip in Google Gemini chat and upload
        it back to the app.
      </p>
      <BriefForm />
    </div>
  );
}
