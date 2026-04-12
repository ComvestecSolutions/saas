import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { getProductAppSnapshot } from "@comvestec/platform";

const getProductSnapshot = createServerFn({ method: "GET" }).handler(() =>
  Effect.runPromise(getProductAppSnapshot),
);

export const Route = createFileRoute("/")({
  loader: () => getProductSnapshot(),
  component: ProductHome,
});

function ProductHome() {
  const snapshot = Route.useLoaderData();

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Tenant experience</p>
        <h1>{snapshot.application}</h1>
        <p className="lede">{snapshot.focus}</p>
      </section>

      <section className="grid">
        <article className="card emphasis-card">
          <h2>Module manifest</h2>
          <p>{snapshot.manifest.moduleId}</p>
        </article>

        <article className="card">
          <h2>Request actor</h2>
          <p>{snapshot.requestContext.actorType}</p>
        </article>

        <article className="card">
          <h2>Resolved tenant</h2>
          <p>
            {snapshot.requestContext.tenant.scope}
            {" · "}
            {snapshot.requestContext.tenant.scopeId}
          </p>
        </article>

        <article className="card">
          <h2>Scopes supported</h2>
          <p>{snapshot.tenancyScopes.length}</p>
        </article>

        <article className="card">
          <h2>Projection profiles</h2>
          <p>{snapshot.platformProjectionDescriptors.length}</p>
        </article>

        <article className="card">
          <h2>Permission seeds</h2>
          <p>{snapshot.permissionDescriptors.length}</p>
        </article>

        <article className="card">
          <h2>Branding keys</h2>
          <p>{snapshot.brandingManifest.configKeys.length}</p>
        </article>
      </section>

      <section className="grid detail-grid">
        <article className="card list-card">
          <h2>Module feature flags</h2>
          <ul>
            {snapshot.manifest.featureFlags.map((flag) => (
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
          <h2>Platform projection descriptors</h2>
          <ul>
            {snapshot.platformProjectionDescriptors.map((descriptor) => (
              <li key={descriptor.profile}>
                <strong>{descriptor.profile}</strong>
                <span>{descriptor.visibleFields.join(", ")}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="card list-card">
          <h2>Permission descriptors</h2>
          <ul>
            {snapshot.permissionDescriptors.map((descriptor) => (
              <li key={descriptor.scope}>
                <strong>{descriptor.scope}</strong>
                <span>{descriptor.description}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="card list-card">
          <h2>Branding feature flags</h2>
          <ul>
            {snapshot.brandingManifest.featureFlags.map((flag) => (
              <li key={flag.key}>
                <strong>{flag.key}</strong>
                <span>{flag.purpose}</span>
                <span className="meta">{flag.allowedScopes.join(", ")}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
