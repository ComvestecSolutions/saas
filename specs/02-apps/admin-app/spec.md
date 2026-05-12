# Admin App Spec

Status: accepted

## Responsibilities

1. Inspect tenants, organizations, memberships, and environments.
2. Manage config, feature flags, permissions, projection profiles, rollout state, and bidirectional config sync or reconciliation workflows.
3. Review audit trails, sensitive-read events, support actions, and operational health.
4. Support compliance and break-glass workflows.
5. Manage tenant branding, branding assets, sender identity metadata, and custom-domain verification state.

## First Backend-Ready Slice

1. Admin-app will consume root-safe app helpers over shared governance, audit, and billing services through route-owned server data or server functions, with those helpers staying root-safe through centralized runtime-loader-backed imports.
2. Operator authorization, audit capture, trusted-session request-context resolution, projected mutation envelopes, and runtime-config approval rules must behave the same for direct first-party calls and backend-owned HTTP adapters.
3. Backend-owned HTTP endpoints remain available for true external callers, tooling, and smoke coverage, but they are not the canonical first-party app boundary and must not become the path that first-party routes use to reach shared logic.
4. Billing repair and reconciliation controls must exist as backend-owned services and HTTP adapters before frontend admin screens ship.

## Backend Concepts Required For Full Admin Delivery

1. Operations Home requires an app-safe aggregated summary surface for posture counts, queues, alerts, and recent activity over the validated governance, billing, support, branding, and audit slices.
2. Tenant Workspace requires a tenant-scoped aggregate projection over tenant management, billing, branding, audit, and support-safe data instead of app-local stitching directly inside components.
3. Navigation visibility, screen entry, and high-risk action availability must come from backend-backed capability resolution over current operator permissions rather than app-local allowlists.
4. Permission and projection-profile administration require backend-owned operator review surfaces over authorization tuples, revocation flows, and projection vocabularies before a first-party management screen can ship safely.
5. Sensitive reveal, approval, rejection, and other high-risk actions must use governed backend-owned reason catalogs and policy metadata; the UI must not invent its own reason options.
6. Data-dense admin screens must expose typed query contracts for filtering, pagination, sorting, exports, and detail lookup instead of relying on oversized client-filtered payloads.
7. Support Operations may ship against the current validated core slice, but the final break-glass detail experience depends on richer support-safe incident projections when reviewer and expiry context are required.
8. If secret reveals or high-risk actions need step-up re-authentication, the challenge state and audit trail must be backend-owned and not implemented as a client-only interaction.

## Delivery Rules For New Backend Concepts

1. Any new backend concept the admin app depends on must land behind shared contracts, services, and first-party app helpers before the frontend route depends on it.
2. Every new admin-required backend concept or projection expansion must ship with focused unit or integration coverage plus backend end-to-end coverage, and then gain browser or Playwright coverage once the admin route consumes it.
3. The same change must update the relevant manifest, spec, implementation plan, and implementation tracker entries so the admin app does not drift away from the platform source of truth.
4. If the new concept changes runtime environment requirements, operator workflow, or architecture/security boundaries, the same slice must update `.env.example`, relevant operator docs/runbooks, and any required ADRs.

## Rules

1. The admin app is powerful but not exempt from audit.
2. Sensitive inspection screens must capture actor, reason, and correlation context.
3. Config and feature screens must show code-declared defaults, persisted overrides, effective values, bidirectional sync status, and the approval source before mutation.
4. Effective runtime config and feature changes should apply without redeploy when the declared schema already exists.
5. The admin app must support both pushing committed code declarations into runtime state and pulling approved runtime changes back into reviewable code artifacts.
6. The admin app must enforce permission checks for database-side runtime changes and record the acting user in audit history.
7. Every admin-side mutation must surface effective changes and approval history.
8. Branding screens must show effective scope, entitlement state, public-safe versus admin-only fields, and custom-domain lifecycle state before mutation.
9. Branding mutations require `branding:manage`, auditable actor identity, and an approval path for high-risk changes such as custom-domain activation.
10. Direct first-party admin calls must reuse the same trusted-session request-context resolution, projected envelopes, security, and audit enforcement as backend-owned HTTP callers rather than relying on app-local special cases or importing `*-http.ts` handlers.
11. Backend-only operator controls for billing reconciliation must preserve the same actor identity in Convex execution, audit logs, and repair-state persistence that the initiating admin request carried.
12. Responsive shell behavior must come from one shared device-classification source. Tablet layouts may collapse the sidebar to an icon rail with hover or focus disclosure, and mobile layouts use a hamburger-triggered drawer instead of duplicating breakpoint logic per screen.
