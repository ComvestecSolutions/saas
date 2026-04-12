# Email Delivery Manifest

Status: accepted

## Technology Boundary

Postal for self-hosted transactional email delivery. The adapter wraps Postal behind an email-delivery boundary so the implementation can swap to Resend, Postmark, or SES without code changes outside the adapter (ADR-012).

## Responsibilities

1. Transactional email rendering and delivery.
2. Delivery tracking, bounce handling, and complaint processing.
3. Template management for system emails (invitations, password resets, notifications).
4. Email reputation and deliverability monitoring.
5. Consumption of approved `tenant-branding` sender identity and branded email chrome.

## Permission Scopes

| Scope          | Description                                                         |
| -------------- | ------------------------------------------------------------------- |
| `email:manage` | Manage email templates, sending domains, and delivery configuration |

## Feature Flags

| Flag                     | Purpose           | Billable | Default | Allowed Scopes |
| ------------------------ | ----------------- | -------- | ------- | -------------- |
| `email-delivery.enabled` | Module visibility | No       | true    | platform       |

## Config Keys

| Key                                 | Description                          | Default | Billable | Allowed Scopes       |
| ----------------------------------- | ------------------------------------ | ------- | -------- | -------------------- |
| `email-delivery.rateLimitPerMinute` | Maximum emails per minute per tenant | 60      | No       | platform, enterprise |

## Data Classifications

| Data                      | Classification      |
| ------------------------- | ------------------- |
| Email content             | tenant-confidential |
| Recipient addresses       | regulated-sensitive |
| Delivery tracking records | internal            |
| DKIM/domain credentials   | secret              |

## Projection Profiles

| Profile | Visible Fields                                   | Audited Fields |
| ------- | ------------------------------------------------ | -------------- |
| admin   | messageId, recipient, status, sentAt, bounceType | recipient      |
| summary | messageId, status, sentAt                        | —              |

## Rules

1. Email content must not be logged in plaintext.
2. Bounce and complaint handling must update recipient suppression lists.
3. System email templates must be version-controlled and reviewable.
4. Branded sender metadata, reply-to identity, and approved email chrome must consume `tenant-branding` projections rather than a separate email-only branding store.
