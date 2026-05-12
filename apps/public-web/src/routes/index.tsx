import { createFileRoute } from "@tanstack/react-router";
import { createPublicWebFileRoute } from "../file-route";

export const Route = createPublicWebFileRoute("/")({
  component: PublicWebShell,
});

function PublicWebShell() {
  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Comvestec SaaS Foundation</p>
        <h1>Public web shell</h1>
        <p className="lede">
          Frontend discovery stays deferred while the subscriber journey backend
          becomes authoritative end to end.
        </p>
      </section>

      <section className="card list-card">
        <h2>Current posture</h2>
        <p>
          This app stays as a thin first-party shell. Plan discovery, auth
          start, checkout, and entitlement decisions should come from shared
          backend services and the backend-owned HTTP boundary, not from route
          loaders or client state.
        </p>
        <p className="meta">
          Required transport remains in the dedicated auth route while the rest
          of the public UI is intentionally minimal.
        </p>
      </section>
    </main>
  );
}
