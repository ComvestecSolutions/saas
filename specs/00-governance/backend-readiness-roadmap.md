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

1. Anonymous plan discovery through backend-owned HTTP routes, with public-web acting only as an optional shell consumer.
2. Keycloak-backed auth start and callback handling with auditable session activation.
3. Tenant provisioning and owner membership creation after validated authentication.
4. Polar hosted checkout session creation and return or cancel handling.
5. Verified webhook processing for payment success, renewal, cancellation, and payment failure.
6. PostgreSQL-backed subscription, entitlement, onboarding, and audit state.
7. Entitlement-backed product access bootstrap with request context, authorization, and field-security enforcement.
8. Usage metering and quota decisions wired behind the same entitlement model.

## Work Order

1. Update governing specs, manifests, and the implementation tracker so the first slice is explicit and reviewable.
2. Add durable PostgreSQL-backed state for customer account mapping, subscription lifecycle, webhook receipts, onboarding runs, and billing event history.
3. Extend shared contracts and module services around plan catalog, checkout, tenant provisioning, entitlement activation, and access bootstrap.
4. Expose plan listing, auth start, auth callback, checkout start, and billing webhook intake through backend-owned HTTP handlers independent of public-web and product-app runtimes; app routes may later consume or proxy those handlers as thin framework edges.
5. Replace caller-supplied demo entitlement inputs with persisted entitlement lookup in runtime config and feature-flag resolution.
6. Enforce authorized product bootstrap through request-context resolution, authorization, and field-security before exposing product data.
7. Wire metering, quota enforcement, audit persistence, replay, and operator recovery flows.
8. Validate the full slice through typecheck, tests, and compose-backed smoke coverage before broadening frontend work.

## Phase Order

### Phase 1: Governance First

1. Update [implementation-tracker.md](implementation-tracker.md) with the backend-readiness priority and honest next gaps.
2. Align [../02-apps/public-web/spec.md](../02-apps/public-web/spec.md) and [../02-apps/product-app/spec.md](../02-apps/product-app/spec.md) with the API-first first release.
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

### Phase 4: Entitled Access

1. Replace demo request contexts in [../../packages/platform/src/services/app-snapshots.ts](../../packages/platform/src/services/app-snapshots.ts) with real request bootstrap.
2. Drive runtime config and feature resolution from persisted entitlements rather than caller-supplied demo arrays.
3. Enforce authorization and field-security on the first product bootstrap payload.

### Phase 5: Billing Lifecycle And Recovery

1. Extend metering and quota enforcement behind the same entitlement state.
2. Persist renewals, cancellations, grace periods, invoice or payment-event history, and failed-payment states.
3. Add operator-safe replay, audit review, onboarding recovery, and billing explanation flows.

## Acceptance Criteria

1. A new user can choose a plan, authenticate, pay, and reach an entitled product bootstrap response without manual database edits.
2. Duplicate billing webhooks do not create duplicate tenant, session, or entitlement state.
3. Failed payment and cancelled subscription states revoke or constrain product access through the same backend path.
4. Cross-tenant access remains denied unless a valid, non-expired break-glass context exists.
5. Sensitive billing and identity data remains projection-safe and auditable.
6. `bun run typecheck` and `bun run test` are green for the implemented slice.

## Out Of Scope For This Milestone

1. Rich frontend flows beyond thin public-web, product-app, and admin-app route boundaries.
2. Custom payment collection instead of Polar hosted checkout.
3. Parallel completion of non-critical modules such as search or import-export unless they become a hard dependency of onboarding or billing.
