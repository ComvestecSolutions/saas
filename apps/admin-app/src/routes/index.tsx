import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { getAdminAppSnapshot } from "@comvestec/platform";

const getAdminSnapshot = createServerFn({ method: "GET" }).handler(() =>
  Effect.runPromise(getAdminAppSnapshot),
);

export const Route = createFileRoute("/")({
  loader: () => getAdminSnapshot(),
  component: AdminHome,
});

function AdminHome() {
  const snapshot = Route.useLoaderData();

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Platform governance</p>
        <h1>{snapshot.application}</h1>
        <p className="lede">{snapshot.focus}</p>
      </section>

      <section className="grid">
        <article className="card featured-card">
          <h2>Manifest</h2>
          <p>{snapshot.manifest.moduleId}</p>
        </article>

        <article className="card">
          <h2>Request actor</h2>
          <p>{snapshot.requestContext.actorType}</p>
        </article>

        <article className="card">
          <h2>Resolved scope</h2>
          <p>
            {snapshot.requestContext.tenant.scope}
            {" · "}
            {snapshot.requestContext.tenant.scopeId}
          </p>
        </article>

        <article className="card">
          <h2>Config keys</h2>
          <p>{snapshot.manifest.configKeys.length}</p>
        </article>

        <article className="card">
          <h2>Feature flags</h2>
          <p>{snapshot.manifest.featureFlags.length}</p>
        </article>

        <article className="card">
          <h2>Permission seeds</h2>
          <p>{snapshot.permissions.length}</p>
        </article>

        <article className="card">
          <h2>Branding controls</h2>
          <p>{snapshot.brandingManifest.permissionScopes.length}</p>
        </article>
      </section>

      <section className="grid detail-grid">
        <article className="card list-card">
          <h2>Runtime configuration keys</h2>
          <ul>
            {snapshot.manifest.configKeys.map((configKey) => (
              <li key={configKey.key}>
                <strong>{configKey.key}</strong>
                <span>{configKey.description}</span>
                <span className="meta">
                  {configKey.billable ? "Billable" : "Free"}
                  {" · "}
                  {configKey.allowedScopes.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </article>

        <article className="card list-card">
          <h2>Feature flags</h2>
          <ul>
            {snapshot.manifest.featureFlags.map((flag) => (
              <li key={flag.key}>
                <strong>{flag.key}</strong>
                <span>{flag.purpose}</span>
                <span className="meta">
                  {flag.defaultEnabled ? "On" : "Off"}
                  {flag.billable ? " · Billable" : ""}
                  {" · "}
                  {flag.allowedScopes.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </article>

        <article className="card list-card">
          <h2>Permission catalog</h2>
          <ul>
            {snapshot.permissions.map((permission) => (
              <li key={permission.scope}>
                <strong>{permission.scope}</strong>
                <span>{permission.description}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="card list-card">
          <h2>Tenant branding controls</h2>
          <ul>
            {snapshot.brandingManifest.configKeys.map((configKey) => (
              <li key={configKey.key}>
                <strong>{configKey.key}</strong>
                <span>{configKey.description}</span>
                <span className="meta">
                  {configKey.billable ? "Billable" : "Free"}
                  {" · "}
                  {configKey.allowedScopes.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
