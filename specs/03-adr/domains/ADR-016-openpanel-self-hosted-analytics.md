# ADR-016 OpenPanel Self-Hosted Analytics

Status: accepted

## Decision

Use OpenPanel as the default product-analytics integration for the SaaS foundation instead of PostHog.

Prefer the self-hosted OpenPanel deployment model as the foundation default. Keep OpenPanel out of the repository's root default Docker Compose profile, but provide a repo-managed `analytics` Docker Compose profile in `ops/docker/compose.yml` with its included definition and local runtime assets owned by `ops/docker/analytics/` so operators can start the OpenPanel stack through the same in-repo deployment surface as the rest of the local platform when needed.

Model the analytics runtime boundary with OpenPanel-native configuration names: `openpanelApiUrl` and `openpanelClientId` in typed runtime environment objects, and `OPENPANEL_API_URL` plus `OPENPANEL_CLIENT_ID` in local environment files.

Keep analytics behind a dedicated platform adapter and shared service-name literal so future provider swaps remain localized to the adapter boundary and the small number of runtime fields that name the current analytics product.

## Rationale

1. OpenPanel satisfies the repository policy for open-source, self-hostable dependencies while preserving a realistic managed migration path through OpenPanel Cloud.
2. OpenPanel publishes a first-party self-hosting workflow with a dedicated Docker Compose deployment and explicit API URL conventions, which fits the repository's preference for reviewable operator setup over opaque vendor-side defaults.
3. Keeping OpenPanel outside the root default Compose baseline avoids inflating the core local stack with another multi-service analytics deployment lifecycle, while an optional `analytics` profile still gives operators a first-class in-repo deployment path.
4. OpenPanel's self-hosted SDK and API initialization model is based on an API URL ending in `/api` plus a project client identifier, so renaming the environment fields away from PostHog-specific host or API-key terminology makes the runtime boundary more honest.
5. The change keeps analytics as a platform-owned seam instead of pushing provider-specific logic into application shells.
6. Reusing the repository's main Compose surface for the optional OpenPanel profile aligns analytics with the rest of the local operator workflow without making it a mandatory baseline dependency.
