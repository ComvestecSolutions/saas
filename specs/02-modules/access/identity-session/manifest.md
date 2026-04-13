# Identity Session Manifest

Status: accepted

## Technology Boundary

Keycloak for authentication, federation, MFA, and session lifecycle. Valkey for session token cache. PostgreSQL for session audit records, callback receipts, and login or logout lifecycle events.

## Responsibilities

1. User authentication flows (login, logout, MFA, password reset).
2. Session lifecycle, token refresh, and idle-timeout enforcement.
3. Federation with external identity providers via Keycloak.
4. Session cache management through Valkey.
5. Consumption of approved `tenant-branding` identity/login branding through branded redirects around Keycloak-owned flows.
6. Auth start and auth callback coordination for public-web and product-app entry points.
7. Session-bound request bootstrap after validated callback completion.

## Branded Redirect Contract

1. Upstream surfaces resolve the public-safe tenant-branding projection before redirecting to login or reset flows.
2. Redirect metadata may include tenant hint, display name hint, approved theme variant, return target, and correlation context.
3. Redirect metadata must not include unpublished assets, sender metadata, DNS proofs, or other secret branding state.

## First Backend-Ready Slice

1. Support auth start from public-web and product-app through thin backend handlers that build branded redirects.
2. Validate auth callback payloads, activate or resume session state, and record auditable lifecycle events before redirecting into product-app.
3. Restrict post-auth redirects to approved application targets and preserve correlation context for downstream audit and billing flows.

## Permission Scopes

| Scope                 | Description                                     |
| --------------------- | ----------------------------------------------- |
| `support:impersonate` | Impersonate a user session for support purposes |

## Feature Flags

| Flag                           | Purpose                   | Billable | Default | Allowed Scopes       |
| ------------------------------ | ------------------------- | -------- | ------- | -------------------- |
| `identity-session.enabled`     | Module visibility         | No       | true    | platform             |
| `identity-session.mfaEnforced` | Require MFA for all users | No       | false   | platform, enterprise |

## Config Keys

| Key                                             | Description                                  | Default | Billable | Allowed Scopes       |
| ----------------------------------------------- | -------------------------------------------- | ------- | -------- | -------------------- |
| `identity-session.session.idleTimeoutMinutes`   | Minutes of inactivity before session expires | 30      | No       | platform, enterprise |
| `identity-session.session.absoluteTimeoutHours` | Maximum session lifetime in hours            | 12      | No       | platform, enterprise |

## Data Classifications

| Data                | Classification      |
| ------------------- | ------------------- |
| Session tokens      | secret              |
| User credentials    | secret              |
| Login audit events  | regulated-sensitive |
| Federation metadata | internal            |

## Projection Profiles

| Profile | Visible Fields                                       | Audited Fields |
| ------- | ---------------------------------------------------- | -------------- |
| admin   | sessionId, userId, loginTime, lastActivity, provider | —              |
| summary | userId, loginTime                                    | —              |

## Rules

1. Session state must not leak across tenants.
2. Impersonation must produce a distinct audit trail.
3. Token refresh must honor idle and absolute timeouts.
4. Identity/session surfaces may consume public-safe `tenant-branding` projections, but they must not own separate branding configuration or bypass custom-domain approval rules.
5. Runtime tenant branding defaults to branded redirect handoff, not dynamic theme mutation inside Keycloak.
6. Auth callback handling must be auditable and safe to retry without duplicating session activation state.
7. Checkout or signup completion must depend on validated session state, not anonymous query parameters.
