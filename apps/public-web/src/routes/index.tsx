import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { getPublicWebSnapshot } from "@comvestec/platform";

const getPublicWebSnapshotServer = createServerFn({ method: "GET" }).handler(
  () => Effect.runPromise(getPublicWebSnapshot),
);

export const Route = createFileRoute("/")({
  loader: () => getPublicWebSnapshotServer(),
  component: PublicWebHome,
});

function PublicWebHome() {
  const snapshot = Route.useLoaderData();

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Comvestec SaaS Foundation</p>
        <h1>{snapshot.application}</h1>
        <p className="lede">{snapshot.focus}</p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Runtime backbone</h2>
          <p>{snapshot.platformRuntime}</p>
        </article>

        <article className="card">
          <h2>Request actor</h2>
          <p>{snapshot.requestContext.actorType}</p>
        </article>

        <article className="card">
          <h2>Branding module</h2>
          <p>{snapshot.branding.moduleId}</p>
        </article>

        <article className="card">
          <h2>Primary app state</h2>
          <p>{snapshot.storage.primaryAppState}</p>
        </article>

        <article className="card">
          <h2>System records</h2>
          <p>{snapshot.storage.systemRecords}</p>
        </article>

        <article className="card">
          <h2>Resolved host</h2>
          <p>{snapshot.requestContext.host ?? "platform default"}</p>
        </article>

        <article className="card">
          <h2>Field security</h2>
          <p>
            {snapshot.secureByDefault
              ? "Enabled at the platform layer"
              : "Disabled"}
          </p>
        </article>
      </section>

      <section className="grid detail-grid">
        <article className="card list-card">
          <h2>Branding feature flags</h2>
          <ul>
            {snapshot.branding.featureFlags.map((flag) => (
              <li key={flag.key}>
                <strong>{flag.key}</strong>
                <span>{flag.purpose}</span>
                <span className="meta">
                  {flag.defaultEnabled ? "On" : "Off"}
                  {flag.billable ? " · Billable" : ""}
                </span>
              </li>
            ))}
          </ul>
        </article>

        <article className="card list-card">
          <h2>Custom-domain lifecycle</h2>
          <ul>
            {snapshot.branding.customDomainLifecycle.map((state) => (
              <li key={state}>{state}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="card list-card">
        <h2>Tenant scope model</h2>
        <ul>
          {snapshot.tenancyScopes.map((scope) => (
            <li key={scope}>{scope}</li>
          ))}
        </ul>
        <p className="meta">
          Branding defaults: {snapshot.branding.companyName} · Allowed
          overrides: {snapshot.branding.supportedScopes.join(", ")}
        </p>
      </section>
    </main>
  );
}
