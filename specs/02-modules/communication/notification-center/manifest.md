# Notification Center Manifest

Status: accepted

## Technology Boundary

Novu for notification orchestration. Postal for email rendering and delivery through `email-delivery`. PostgreSQL for notification-center email receipt state, exact email preference overrides, suppression outcomes, digest scheduling state, and operator inspection. Convex for actor-targeted in-app notification state and current-actor inbox lifecycle.

## Responsibilities

1. Actor-targeted in-app notifications and current-actor inbox state.
2. Channel orchestration for email, push, SMS, and future integrations.
3. Tenant-aware delivery preference and suppression-policy support.
4. Novu integration boundary.
5. Consumption of approved `tenant-branding` headers, footers, and channel-aware notification chrome.
6. Durable notification-center-owned email receipt state for orchestration outcomes and correlated operator inspection.
7. Exact email recipient and template preference overrides with audited operator management.
8. Operator-safe inspection plus current-actor list, read, and dismiss flows for in-app notifications over the shared backend surface.
9. Future welcome-campaign and newsletter email orchestration through shared `email-delivery` code-owned templates and the same exact-template preference model.

## Permission Scopes

| Scope                 | Description                                                    |
| --------------------- | -------------------------------------------------------------- |
| `notification:manage` | Manage notification templates, channels, and delivery policies |

## Feature Flags

| Flag                          | Purpose           | Billable | Default | Allowed Scopes |
| ----------------------------- | ----------------- | -------- | ------- | -------------- |
| `notification-center.enabled` | Module visibility | No       | true    | platform       |

## Config Keys

| Key                                          | Description                                                   | Default | Billable | Allowed Scopes         |
| -------------------------------------------- | ------------------------------------------------------------- | ------- | -------- | ---------------------- |
| `notification-center.digest.intervalMinutes` | Active digest window in minutes; `0` preserves immediate send | 0       | No       | platform, organization |

## Data Classifications

| Data                        | Classification      |
| --------------------------- | ------------------- |
| Notification id             | internal            |
| Channel                     | internal            |
| Family                      | internal            |
| Status                      | internal            |
| Recipient                   | regulated-sensitive |
| Template                    | internal            |
| Actor id                    | regulated-sensitive |
| Source module               | internal            |
| Source event                | internal            |
| Title                       | tenant-confidential |
| Body summary                | tenant-confidential |
| Action label                | tenant-confidential |
| Action URL                  | tenant-confidential |
| Correlation id              | internal            |
| Correlated email receipt id | internal            |
| Correlated digest run id    | internal            |
| Read at                     | internal            |
| Dismissed at                | internal            |
| Email delivery message      | internal            |
| Queue failure summary       | internal            |
| Suppression reason          | internal            |
| Created at                  | internal            |
| Enabled                     | internal            |
| Updated by                  | internal            |
| Updated at                  | internal            |

## Projection Profiles

| Profile | Visible Fields                                                                                                                                                                                                                                                                                                                      | Audited Fields                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| summary | id, channel, family, status, title, bodySummary, actionLabel, actionUrl, readAt, dismissedAt, createdAt, updatedAt                                                                                                                                                                                                                  | —                                                              |
| admin   | id, channel, family, status, recipient, template, actorId, sourceModuleId, sourceEventId, title, bodySummary, actionLabel, actionUrl, correlationId, correlatedEmailReceiptId, correlatedDigestRunId, readAt, dismissedAt, emailDeliveryMessageId, queueFailureSummary, suppressionReason, createdAt, enabled, updatedBy, updatedAt | recipient, actorId, title, bodySummary, actionLabel, actionUrl |

## Rules

1. Notification preferences must remain tenant-aware and auditable when security-relevant.
2. Notification templates and channels must be configurable without hidden behavior.
3. Product modules emit domain events; they do not own delivery pipelines.
4. Notification templates may consume `tenant-branding` projections but must not own independent branding overrides.
5. Notification-center receipts capture orchestration state only; queued and queue-failed receipts link to `email-delivery` message ids when a provider send occurred, while suppressed receipts remain provider-message-id-free instead of duplicating provider-delivery tracking.
6. Exact email preference overrides are keyed by tenant scope, recipient, and template and must suppress dispatch before downstream provider handoff when disabled.
7. Positive digest intervals may batch only accepted digest families through the shared workflow-jobs control plane, while `0` preserves the existing immediate orchestration path.
8. Actor-targeted in-app notifications must remain tenant-scoped, support current-actor list, read, and dismiss behavior, and allow operator-safe inspection without bypassing shared field-security or audit rules.
9. When notification-center owns welcome-campaign or newsletter dispatch, it must use the shared `email-delivery` code-owned template registry and existing exact-template preference enforcement instead of provider-authored bodies or campaign-local template stores.
