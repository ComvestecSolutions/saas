# Product App Spec

Status: accepted

## Responsibilities

1. Authenticated end-user application shell.
2. Tenant-aware navigation and context switching.
3. Product-grade data loading with route ownership and selective real-time behavior.
4. Account, billing, notification, and user settings entry points.
5. Auth callback completion, entitled access bootstrap, and post-purchase billing status entry points.
6. Effective tenant-branding tokens applied to authenticated shell chrome and shared documents.

## First Backend-Ready Slice

1. Product-app consumes root-safe app helpers over shared backend services for auth callback completion, signed callback-state validation, session-bound request bootstrap, entitled access bootstrap, and initial billing status responses, with the auth callback kept as a thin request-boundary edge that writes session transport and honors signed post-auth handoff paths before the root loader resolves bootstrap data.
2. The same thin request-boundary pattern may invalidate backend session state, persist logout or stale-session lifecycle evidence when stored session context still exists, and clear first-party session transport for explicit logout and stale-session recovery routes, with that behavior staying in shared backend services rather than app-local transport code.
3. The first milestone stays shared-service-first, so thin loaders, actions, or server functions may exist before richer product screens, but backend logic stays in shared platform services rather than internal HTTP hops or app-local transport helpers.
4. Product checkout handoff may accept only approved first-party public-web return URLs, and product access after checkout must resolve from persisted entitlements and validated session state, not from frontend assumptions or return query parameters.

## Rules

1. No product screen may rely on client-only authorization.
2. Route loaders are the default for route-scoped data.
3. Convex subscriptions are opt-in for views that benefit from live updates.
4. Branding must arrive through route-owned server data or shared platform snapshots, not through a client-only theme store.
5. Product surfaces must fall back to platform branding when tenant branding is unavailable or unentitled.
6. Auth callback and access bootstrap must derive request context and correlation from validated backend session state, signed callback state, and request-bound session transport, and the route boundary must stay a thin wrapper over shared platform helpers rather than an app-local transport implementation or a direct `*-http.ts` import.
7. Billing visibility and module access must come from backend entitlement resolution, not from checkout return parameters or client cache.
