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

1. Product-app consumes shared backend functions for auth callback completion, signed callback-state validation, session-bound request bootstrap, entitled access bootstrap, and initial billing status responses, with the auth callback writing session transport before the root loader resolves bootstrap data.
2. The first milestone stays backend-function-first, so thin loaders, actions, or server functions may exist before richer product screens, but backend logic stays in shared platform services rather than internal HTTP hops.
3. Product access after checkout must resolve from persisted entitlements and validated session state, not from frontend assumptions or return query parameters.

## Rules

1. No product screen may rely on client-only authorization.
2. Route loaders are the default for route-scoped data.
3. Convex subscriptions are opt-in for views that benefit from live updates.
4. Branding must arrive through route-owned server data or shared platform snapshots, not through a client-only theme store.
5. Product surfaces must fall back to platform branding when tenant branding is unavailable or unentitled.
6. Auth callback and access bootstrap must derive request context from validated backend session state, signed callback state, and request-bound session transport, not from client-triggered bootstrap actions or browser-owned tenant metadata.
7. Billing visibility and module access must come from backend entitlement resolution, not from checkout return parameters or client cache.
