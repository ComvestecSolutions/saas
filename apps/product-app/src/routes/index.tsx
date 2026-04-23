import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: ProductShell,
});

function ProductShell() {
  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Tenant experience</p>
        <h1>Product app shell</h1>
        <p className="lede">
          Authenticated product UI remains deferred until backend bootstrap,
          authorization, field security, and entitlement resolution are fully
          authoritative.
        </p>
      </section>

      <section className="card list-card">
        <h2>Current posture</h2>
        <p>
          The product route should eventually consume an already-authorized,
          already-projected backend bootstrap. Until that path is complete, this
          page stays as a shell instead of presenting demo request context,
          entitlements, permissions, or billing state.
        </p>
        <p className="meta">
          The auth callback transport remains in place, but product home is no
          longer responsible for previewing backend scaffolding.
        </p>
      </section>
    </main>
  );
}
