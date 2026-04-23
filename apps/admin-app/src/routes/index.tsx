import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: AdminShell,
});

function AdminShell() {
  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Platform governance</p>
        <h1>Admin app shell</h1>
        <p className="lede">
          Operator UI stays deferred until governance mutations, audit review,
          and authorization are validated end to end in shared backend services.
        </p>
      </section>

      <section className="card list-card">
        <h2>Current posture</h2>
        <p>
          Admin functionality should be driven by backend-owned governance,
          billing repair, runtime config, and audit services. Until those paths
          are fully validated, this app remains a minimal operator shell.
        </p>
        <p className="meta">
          Snapshot previews and demo governance summaries are intentionally
          removed so the UI does not masquerade as a completed operator surface.
        </p>
      </section>
    </main>
  );
}
