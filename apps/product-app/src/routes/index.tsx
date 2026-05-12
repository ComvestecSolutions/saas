import { createFileRoute } from "@tanstack/react-router";
import { createProductAppFileRoute } from "../file-route";
import { loadProductHomeLoaderData } from "../lib/home-route-loader";

export const Route = createProductAppFileRoute("/")({
  loader: () => loadProductHomeLoaderData(),
  component: ProductHome,
});

function ProductHome() {
  const routeData = Route.useLoaderData();

  if (routeData.kind === "shell") {
    return (
      <main className="app-shell">
        <section className="hero-panel">
          <p className="eyebrow">Tenant experience</p>
          <h1>Product app shell</h1>
          <p className="lede">
            Product home now resolves backend bootstrap from the incoming
            request when a validated subscriber session is present. Without that
            session transport, the route stays a thin shell instead of falling
            back to demo request context or client-owned state.
          </p>
        </section>

        <section className="card list-card">
          <h2>Current posture</h2>
          <p>
            The root route calls the shared request-backed bootstrap helper from
            a server function. No app-local session parsing or internal HTTP hop
            is involved.
          </p>
          <p className="meta">
            A validated session cookie or header is required before the product
            shell exposes resolved tenant data.
          </p>
        </section>
      </main>
    );
  }

  const { bootstrap } = routeData;
  const snapshot = bootstrap.snapshot;

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Tenant experience</p>
        <h1>{snapshot?.application ?? "Product app shell"}</h1>
        <p className="lede">
          {snapshot?.focus ??
            "The product shell resolves authorization, billing state, and repair readiness through the shared backend bootstrap before rendering any tenant-specific payload."}
        </p>
      </section>

      <section className="grid">
        <article className="card emphasis-card">
          <h2>Bootstrap status</h2>
          <p>
            {bootstrap.authorization.allowed ? "Authorized" : "Access denied"}
          </p>
          <p className="meta">{bootstrap.authorization.reason}</p>
        </article>

        <article className="card">
          <h2>Request actor</h2>
          <p>{bootstrap.requestContext.actorType}</p>
        </article>

        <article className="card">
          <h2>Resolved tenant</h2>
          <p>
            {bootstrap.requestContext.tenant.scope} {"\u00b7"}{" "}
            {bootstrap.requestContext.tenant.scopeId}
          </p>
        </article>

        <article className="card">
          <h2>Enabled modules</h2>
          <p>{bootstrap.enabledModules?.length ?? 0}</p>
        </article>
      </section>

      <section className="grid detail-grid">
        <article className="card list-card">
          <h2>Billing status</h2>
          <p>{bootstrap.billingStatus?.status ?? "No active subscription"}</p>
          <p className="meta">
            {bootstrap.billingStatus?.plan ?? "No plan selected"}
          </p>
        </article>

        <article className="card list-card">
          <h2>Session bootstrap</h2>
          <p>
            The route delegates request-bound session extraction and backend
            bootstrap assembly to the shared platform helper rather than
            duplicating transport logic in the app.
          </p>
          <p className="meta">
            {snapshot === undefined
              ? "The backend withheld the projected product snapshot for this request."
              : "The rendered shell is backed by the same bootstrap result that resolved authorization and billing state."}
          </p>
        </article>
      </section>
    </main>
  );
}
