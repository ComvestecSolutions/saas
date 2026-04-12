# Billing and Metering Manifest

Status: accepted

## Technology Boundary

Polar for subscription management and commercial packaging. OpenMeter for usage event ingestion and aggregation. PostgreSQL via Drizzle for billing state, entitlement records, and metering snapshots.

## Responsibilities

1. Subscription plans and commercial packaging.
2. Meter ingestion and usage aggregation.
3. Billing state required by the product and admin surfaces.
4. Entitlement management — hard gate for billable config keys and feature flags.
5. Polar and OpenMeter integration boundaries.
6. Usage quota enforcement for billable or protected platform capabilities.
7. Internal per-tenant cost allocation for capacity planning and margin analysis.

## Permission Scopes

| Scope           | Description                                            |
| --------------- | ------------------------------------------------------ |
| `billing:read`  | Read billing state, invoices, and entitlements         |
| `billing:write` | Manage subscriptions, plans, and entitlement overrides |

## Feature Flags

| Flag                           | Purpose           | Billable | Default | Allowed Scopes |
| ------------------------------ | ----------------- | -------- | ------- | -------------- |
| `billing-and-metering.enabled` | Module visibility | No       | true    | platform       |

## Config Keys

| Key                                               | Description                                         | Default | Billable | Allowed Scopes |
| ------------------------------------------------- | --------------------------------------------------- | ------- | -------- | -------------- |
| `billing-and-metering.meter.flushIntervalSeconds` | Seconds between meter event flushes to OpenMeter    | 30      | No       | platform       |
| `billing-and-metering.usage.enforcementMode`      | Quota enforcement mode: observe, throttle, or block | observe | No       | platform       |

## Data Classifications

| Data                          | Classification      |
| ----------------------------- | ------------------- |
| Subscription and plan details | tenant-confidential |
| Invoice records               | regulated-sensitive |
| Usage meter events            | tenant-confidential |
| Entitlement records           | tenant-confidential |
| Payment method tokens         | secret              |

## Projection Profiles

| Profile | Visible Fields                                                      | Audited Fields |
| ------- | ------------------------------------------------------------------- | -------------- |
| billing | plan, status, currentPeriodEnd, usage                               | —              |
| admin   | plan, status, currentPeriodEnd, usage, entitlements, invoiceHistory | entitlements   |
| summary | plan, status                                                        | —              |

## Rules

1. Billing state visible to end users must use explicit projection profiles.
2. Financially relevant events must be auditable.
3. Product modules may emit usage events but must not embed billing logic directly.
4. Pricing, entitlements, and commercial flags must be inspectable in the admin app.
5. Quota enforcement decisions must be explainable to operators and support teams.
6. Internal cost allocation must not alter customer-facing billing records.
