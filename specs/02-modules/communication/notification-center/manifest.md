# Notification Center Manifest

Status: accepted

## Technology Boundary

Novu for multi-channel notification orchestration (in-app, email, push, SMS). Postal for email rendering and delivery. Convex for in-app notification state.

## Responsibilities

1. In-app notifications.
2. Channel orchestration for email, push, SMS, and future integrations.
3. Delivery preference and policy support.
4. Novu integration boundary.
5. Consumption of approved `tenant-branding` headers, footers, and channel-aware notification chrome.

## Permission Scopes

| Scope                 | Description                                                    |
| --------------------- | -------------------------------------------------------------- |
| `notification:manage` | Manage notification templates, channels, and delivery policies |

## Feature Flags

| Flag                          | Purpose           | Billable | Default | Allowed Scopes |
| ----------------------------- | ----------------- | -------- | ------- | -------------- |
| `notification-center.enabled` | Module visibility | No       | true    | platform       |

## Config Keys

| Key                                          | Description                    | Default | Billable | Allowed Scopes         |
| -------------------------------------------- | ------------------------------ | ------- | -------- | ---------------------- |
| `notification-center.digest.intervalMinutes` | Minutes between digest batches | 15      | No       | platform, organization |

## Data Classifications

| Data                 | Classification      |
| -------------------- | ------------------- |
| Notification content | tenant-confidential |
| Delivery preferences | internal            |
| Push tokens          | secret              |

## Projection Profiles

| Profile | Visible Fields                                      | Audited Fields |
| ------- | --------------------------------------------------- | -------------- |
| summary | id, channel, status, createdAt                      | —              |
| admin   | id, channel, status, recipient, template, createdAt | recipient      |

## Rules

1. Notification preferences must remain tenant-aware and auditable when security-relevant.
2. Notification templates and channels must be configurable without hidden behavior.
3. Product modules emit domain events; they do not own delivery pipelines.
4. Notification templates may consume `tenant-branding` projections but must not own independent branding overrides.
