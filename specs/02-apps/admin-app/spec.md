# Admin App Spec

Status: accepted

## Responsibilities

1. Inspect tenants, organizations, memberships, and environments.
2. Manage config, feature flags, permissions, projection profiles, rollout state, and bidirectional config sync or reconciliation workflows.
3. Review audit trails, sensitive-read events, support actions, and operational health.
4. Support compliance and break-glass workflows.
5. Manage tenant branding, branding assets, sender identity metadata, and custom-domain verification state.

## First Backend-Ready Slice

1. Admin-app will consume shared governance, audit, and billing backend functions through route-owned server data or server functions, with shared app helpers staying root-safe through centralized runtime-loader-backed imports.
2. Operator authorization, audit capture, trusted-session request-context resolution, projected mutation envelopes, and runtime-config approval rules must behave the same for direct first-party calls and backend-owned HTTP adapters.
3. Backend-owned HTTP endpoints remain available for true external callers, tooling, and smoke coverage, but they are not the canonical first-party app boundary.
4. Billing repair and reconciliation controls must exist as backend-owned services and HTTP adapters before frontend admin screens ship.

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
10. Direct first-party admin calls must reuse the same trusted-session request-context resolution, projected envelopes, security, and audit enforcement as backend-owned HTTP callers rather than relying on app-local special cases.
11. Backend-only operator controls for billing reconciliation must preserve the same actor identity in Convex execution, audit logs, and repair-state persistence that the initiating admin request carried.
