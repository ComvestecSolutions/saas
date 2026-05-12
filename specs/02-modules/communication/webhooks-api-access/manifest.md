# Webhooks and API Access Manifest

Status: accepted

## Technology Boundary

In-process Effect services for inbound provider webhook intake plus outbound webhook registration and delivery. PostgreSQL for webhook subscription storage, receipt logs, idempotency records, and delivery logs. Shared workflow-jobs plus Convex-backed scheduling for outbound delivery retry and backoff.

## Responsibilities

1. Webhook subscription management.
2. Event-to-webhook dispatch with retry and backoff.
3. Inbound provider webhook verification, normalization, and replay.
4. API key lifecycle for external integrations.
5. Delivery and receipt logging with failure visibility.

## First Backend-Ready Slice

1. Accept billing-provider webhooks for checkout completion, renewal, cancellation, payment failure, and entitlement sync.
2. Verify webhook authenticity, store receipt metadata, and enforce idempotent processing before mutating billing or access state.
3. Expose replay or retry surfaces for operators after processing failures.

## Permission Scopes

| Scope            | Description                               |
| ---------------- | ----------------------------------------- |
| `webhook:manage` | Manage webhook subscriptions and API keys |

## Feature Flags

| Flag                          | Purpose           | Billable | Default | Allowed Scopes |
| ----------------------------- | ----------------- | -------- | ------- | -------------- |
| `webhooks-api-access.enabled` | Module visibility | No       | false   | platform       |

## Config Keys

| Key                                       | Description                                 | Default | Billable | Allowed Scopes |
| ----------------------------------------- | ------------------------------------------- | ------- | -------- | -------------- |
| `webhooks-api-access.delivery.maxRetries` | Maximum retry attempts per webhook delivery | 5       | No       | platform       |

## Data Classifications

| Data             | Classification      |
| ---------------- | ------------------- |
| Webhook URLs     | tenant-confidential |
| API keys         | secret              |
| Webhook payloads | tenant-confidential |
| Delivery logs    | internal            |

## Projection Profiles

| Profile | Visible Fields                                                                                                | Audited Fields |
| ------- | ------------------------------------------------------------------------------------------------------------- | -------------- |
| admin   | apiKeyId, label, prefix, subscriptionId, url, events, status, createdAt, rotatedAt, revokedAt, lastDeliveryAt | label, url     |
| summary | apiKeyId, label, prefix, subscriptionId, status                                                               | —              |

## Rules

1. Webhook payloads must honor field-security projections.
2. API keys must be rotatable and auditable.
3. Failed deliveries must be retried with exponential backoff and leave durable repair evidence for the shared operator recovery surfaces.
4. Inbound provider webhooks must be authenticated, idempotent, and auditable before any billing or entitlement mutation runs.
5. Return-url handlers must not bypass webhook verification as the source of truth for payment outcomes.
