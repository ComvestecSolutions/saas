# Backend Readiness Roadmap

Status: accepted

## Goal

Deliver one backend-ready subscriber journey before expanding frontend scope. For this milestone, a user must be able to:

This roadmap defines the intended backend-ready slice. Use [implementation-tracker.md](implementation-tracker.md) as the source of truth for the current maturity of each step in that slice.

1. View a public-safe plan catalog.
2. Start authentication and complete the identity callback.
3. Create a hosted checkout session.
4. Complete payment and have the platform reconcile the result from verified webhooks.
5. Receive tenant provisioning, entitlements, and an authorized product bootstrap response.

## Definition Of Backend Ready

The backend-ready milestone is reached only when the platform supports the following without operator hand-editing of runtime state:

1. Anonymous plan discovery through backend-owned HTTP routes, with public-web acting only as an optional shell consumer and first-party app routes remaining thin request-boundary server-function edges over root-safe app helpers and the same shared backend services that power the HTTP layer.
2. Keycloak-backed auth start and callback handling with auditable session activation.
3. Tenant provisioning and owner membership creation after validated authentication.
4. Polar hosted checkout session creation and return or cancel handling.
5. Verified webhook processing for payment success, renewal, cancellation, and payment failure.
6. PostgreSQL-backed customer-account mapping, subscription, entitlement, onboarding, and audit state.
7. Entitlement-backed product access bootstrap with request context, authorization, and field-security enforcement.
8. Usage metering and quota decisions wired behind the same entitlement model.

## Work Order

1. Update governing specs, manifests, and the implementation tracker so the first slice is explicit and reviewable.
2. Add durable PostgreSQL-backed state for customer account mapping, subscription lifecycle, webhook receipts, onboarding runs, and billing event history.
3. Extend shared contracts and module services around plan catalog, checkout, tenant provisioning, entitlement activation, and access bootstrap.
4. Expose plan listing, auth start, auth callback, checkout start, and billing webhook intake through backend-owned HTTP handlers independent of public-web and product-app runtimes, composed from shared request-boundary and transport helpers. First-party app routes should use TanStack Start server functions and root-safe shared app helpers over the same base services, while true external callers continue to use the backend-owned HTTP layer. Do not duplicate workflow or policy logic across those two transport layers.
5. Replace caller-supplied demo entitlement inputs with persisted entitlement lookup in runtime config and feature-flag resolution.
6. Enforce authorized product bootstrap through request-context resolution, authorization, and field-security before exposing product data.
7. Wire metering, quota enforcement, audit persistence, replay, checkout-intent recovery, and operator recovery flows.
8. Validate the full slice through typecheck, tests, and compose-backed smoke coverage before broadening frontend work.

## Phase Order

### Phase 1: Governance First

1. Update [implementation-tracker.md](implementation-tracker.md) with the backend-readiness priority and honest next gaps.
2. Align [../02-apps/public-web/spec.md](../02-apps/public-web/spec.md), [../02-apps/product-app/spec.md](../02-apps/product-app/spec.md), [../02-apps/admin-app/spec.md](../02-apps/admin-app/spec.md), and [../03-adr/architecture/ADR-018-h3-backend-http-layer.md](../03-adr/architecture/ADR-018-h3-backend-http-layer.md) so first-party apps consume shared backend services through root-safe app helpers and server functions while H3 remains the external caller boundary, the request-boundary or transport shell stays centralized, and reusable business logic stays in shared services rather than in either transport adapter.
3. Align the [identity-session](../02-modules/access/identity-session/manifest.md), [tenant-management](../02-modules/domains/tenant-management/manifest.md), [billing-and-metering](../02-modules/domains/billing-and-metering/manifest.md), and [webhooks-api-access](../02-modules/communication/webhooks-api-access/manifest.md) manifests with the first slice.

### Phase 2: Durable State

1. Expand the domain-specific PostgreSQL persistence modules exported from [../../packages/modules/src/persistence/postgres/index.ts](../../packages/modules/src/persistence/postgres/index.ts) for subscriptions, invoices or payment events, webhook receipts, onboarding runs, and onboarding steps.
2. Keep PostgreSQL as the source of truth for billing, entitlements, audit, and webhook idempotency.
3. Use Convex only where workflow orchestration or app-state reactivity is actually required.

### Phase 3: Acquisition Flow

1. Extend [../../packages/platform/src/adapters/identity/keycloak.ts](../../packages/platform/src/adapters/identity/keycloak.ts) for auth start and auth callback boundaries.
2. Extend [../../packages/platform/src/adapters/features-billing/polar.ts](../../packages/platform/src/adapters/features-billing/polar.ts) for plan listing, hosted checkout creation, and subscription reconciliation.
3. Implement inbound billing-provider webhook verification and idempotent processing before mutating entitlement or access state.
4. Provision tenant and owner membership immediately after validated authentication.
5. Treat provider-side customer, order, and subscription reads as eventually consistent with webhook-driven resource creation, so repair and replay flows rely on delayed refresh or verified webhook convergence rather than immediate read-after-write assumptions.

### Phase 4: Entitled Access

1. Replace demo request contexts in [../../packages/platform/src/services/apps/app-snapshots.ts](../../packages/platform/src/services/apps/app-snapshots.ts) with real request bootstrap.
2. Drive runtime config and feature resolution from persisted entitlements rather than caller-supplied demo arrays.
3. Enforce authorization and field-security on the first product bootstrap payload.

### Phase 5: Billing Lifecycle And Recovery

1. Extend metering and quota enforcement behind the same entitlement state.
2. Persist renewals, cancellations, grace periods, invoice or payment-event history, and failed-payment states.
3. Close the remaining customer-account convergence and onboarding recovery flows while keeping operator-safe replay and billing explanation on the same projected admin billing backend surface.

## Acceptance Criteria

1. A new user can choose a plan, authenticate, pay, and reach an entitled product bootstrap response without manual database edits.
2. Duplicate billing webhooks do not create duplicate tenant, session, or entitlement state.
3. Verified billing reconciliation persists enough durable customer and owner linkage to repair missing onboarding or provisioning state without another login when prior tenant evidence exists.
4. Failed payment and cancelled subscription states revoke or constrain product access through the same backend path.
5. Cross-tenant access remains denied unless a valid, non-expired break-glass context exists.
6. Sensitive billing and identity data remains projection-safe and auditable.
7. Replay and repair paths tolerate provider-side resource lag by treating direct provider reads as eventually consistent and falling back to verified webhook and PostgreSQL-backed truth when resources have not materialized yet.
8. `bun run typecheck` and `bun run test` are green for the implemented slice.

## Out Of Scope For This Milestone

1. Rich frontend flows beyond thin public-web, product-app, and admin-app route boundaries; first-party app routes remain thin edges over root-safe app helpers that delegate to shared backend services rather than full-featured API clients or internal HTTP consumers.
2. Custom payment collection instead of Polar hosted checkout.
3. Parallel completion of non-critical modules such as search or import-export unless they become a hard dependency of onboarding or billing.
