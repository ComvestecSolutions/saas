# Billing and Metering Manifest

Status: accepted

## Technology Boundary

Polar hosted checkout for subscription management and commercial packaging. OpenMeter for usage event ingestion and aggregation. PostgreSQL via Drizzle for billing state, entitlement records, webhook receipts, and metering snapshots.

## Responsibilities

1. Flexible subscription plans and commercial packaging with monthly and yearly price intervals.
2. Meter ingestion and usage aggregation.
3. Billing state required by the product and admin surfaces.
4. Entitlement management — hard gate for billable config keys and feature flags.
5. Polar and OpenMeter integration boundaries.
6. Optional usage metering and quota enforcement for billable or protected platform capabilities.
7. Internal per-tenant cost allocation for capacity planning and margin analysis.
8. Public-safe plan catalog and hosted checkout session creation.
9. Subscription, payment, and entitlement reconciliation from verified provider events.
10. Plan composition from modules and feature entitlements, with most entitlements remaining non-metered by default.

## First Backend-Ready Slice

1. List public-safe sellable plans without exposing operator-only pricing metadata.
2. Create hosted checkout sessions for authenticated or pending tenants.
3. Reconcile subscription state and entitlement activation from verified provider webhooks rather than return URLs.
4. Provide billing status bootstrap for entitled product access and operator support.
5. Support both monthly and yearly pricing for the same sellable plan when the catalog declares both prices.

## Permission Scopes

| Scope           | Description                                            |
| --------------- | ------------------------------------------------------ |
| `billing:read`  | Read billing state, invoices, and entitlements         |
| `billing:write` | Manage subscriptions, plans, and entitlement overrides |

## Feature Flags

| Flag                                    | Purpose                                                                 | Billable | Default | Allowed Scopes |
| --------------------------------------- | ----------------------------------------------------------------------- | -------- | ------- | -------------- |
| `billing-and-metering.enabled`          | Module visibility                                                       | No       | true    | platform       |
| `billing-and-metering.quotaEnforcement` | Automatic quota enforcement workflows                                   | No       | false   | platform       |
| `billing-and-metering.api.requests`     | Billable API request capability used by billing entitlements and meters | Yes      | false   | platform       |

## Entitlement Key Rules

1. Every entitlement `featureKey` must resolve to a feature flag that already exists on the owning module manifest.
2. Module-access entitlements must use the module's declared enabled feature flag key, not an invented pseudo feature.
3. Custom commercial entitlements such as metered request access must be declared as module feature flags before any plan or webhook flow can reference them.

## Config Keys

- `billing-and-metering.meter.flushIntervalSeconds`: Seconds between meter event flushes to OpenMeter. Default `30`. Billable `No`. Allowed scopes `platform`.
- `billing-and-metering.usage.enforcementMode`: Default enforcement mode for metered or rate-limited entitlements: observe, rate-limit, or block. Default `observe`. Billable `No`. Allowed scopes `platform`.

## Data Classifications

| Data                          | Classification      |
| ----------------------------- | ------------------- |
| Subscription and plan details | tenant-confidential |
| Invoice records               | regulated-sensitive |
| Usage meter events            | tenant-confidential |
| Entitlement records           | tenant-confidential |
| Payment method tokens         | secret              |

## Projection Profiles

- `billing`: Visible fields `plan`, `billingInterval`, `status`, `currentPeriodEnd`, `usage`. Audited fields `none`.
- `admin`: Visible fields `plan`, `billingInterval`, `status`, `currentPeriodEnd`, `prices`, `includedEntitlements`, `meteredEntitlements`, `rateLimits`, `usage`, `invoiceHistory`. Audited fields `includedEntitlements`, `meteredEntitlements`, `rateLimits`, `invoiceHistory`.
- `summary`: Visible fields `plan`, `billingInterval`, `status`. Audited fields `none`.

## Rules

1. Billing state visible to end users must use explicit projection profiles.
2. Financially relevant events must be auditable.
3. Product modules may emit usage events but must not embed billing logic directly.
4. Pricing, entitlements, and commercial flags must be inspectable in the admin app.
5. Quota enforcement decisions must be explainable to operators and support teams.
6. Internal cost allocation must not alter customer-facing billing records.
7. Hosted checkout return handlers are advisory only; verified webhook processing is the source of truth for subscription and entitlement state.
8. Subscription, entitlement, and invoice transitions must be durably persisted before product access changes.
9. A plan entitlement defaults to included non-metered access unless it explicitly declares usage metering or rate-limit enforcement.
10. Most feature access should remain non-metered; metering and quota controls are opt-in per entitlement item.
11. Rate limiting is the default constrained-feature enforcement pattern unless a stricter block mode is explicitly required.
