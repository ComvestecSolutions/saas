# Product App Spec

Status: accepted

## Responsibilities

1. Authenticated end-user application shell.
2. Tenant-aware navigation and context switching.
3. Product-grade data loading with route ownership and selective real-time behavior.
4. Account, billing, notification, and user settings entry points.
5. Effective tenant-branding tokens applied to authenticated shell chrome and shared documents.

## Rules

1. No product screen may rely on client-only authorization.
2. Route loaders are the default for route-scoped data.
3. Convex subscriptions are opt-in for views that benefit from live updates.
4. Branding must arrive through route-owned server data or shared platform snapshots, not through a client-only theme store.
5. Product surfaces must fall back to platform branding when tenant branding is unavailable or unentitled.
