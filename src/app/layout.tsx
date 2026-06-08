import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Story Video Factory",
  description: "Generate story videos: script + voice + clips + motion text overlay.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            borderBottom: "1px solid var(--border)",
            padding: "1rem 0",
            marginBottom: "2rem",
            background: "var(--bg-elev)",
          }}
        >
          <div
            className="container"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
          >
            <a href="/" style={{ color: "var(--text)", textDecoration: "none", fontWeight: 600 }}>
              <span style={{ color: "var(--accent)" }}>▶</span> Story Video Factory
            </a>
            <nav style={{ display: "flex", gap: "1rem" }}>
              <a href="/" className="muted">
                Jobs
              </a>
              <a href="/new" className="btn">
                + New Brief
              </a>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
