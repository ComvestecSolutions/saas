# Webhooks and API Access Manifest

Status: accepted

## Technology Boundary

In-process Effect services for webhook registration and delivery. PostgreSQL for webhook subscription storage and delivery logs. Valkey for delivery rate limiting.

## Responsibilities

1. Webhook subscription management.
2. Event-to-webhook dispatch with retry and backoff.
3. API key lifecycle for external integrations.
4. Delivery logging and failure visibility.

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

| Profile | Visible Fields                                    | Audited Fields |
| ------- | ------------------------------------------------- | -------------- |
| admin   | subscriptionId, url, events, status, lastDelivery | url            |
| summary | subscriptionId, status                            | —              |

## Rules

1. Webhook payloads must honor field-security projections.
2. API keys must be rotatable and auditable.
3. Failed deliveries must be retried with exponential backoff and visible in admin.
