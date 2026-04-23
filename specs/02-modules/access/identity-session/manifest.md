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
8. Backend token and service-actor coordination for downstream trusted execution surfaces such as Convex.

## Branded Redirect Contract

1. Upstream surfaces resolve the public-safe tenant-branding projection before redirecting to login or reset flows.
2. Redirect metadata may include tenant hint, display name hint, approved theme variant, a validated absolute callback URI to an approved first-party application target, and correlation context.
3. Redirect metadata must not include unpublished assets, sender metadata, DNS proofs, or other secret branding state.

## First Backend-Ready Slice

1. Support auth start from public-web and product-app through thin backend handlers that build branded redirects.
2. Validate auth callback payloads together with a server-generated callback-state token, activate or resume session state, record auditable lifecycle events, and set request transport before redirecting into product-app.
3. Restrict post-auth redirects to approved application targets expressed as validated absolute callback URIs, and preserve correlation plus tenant context through server-generated callback state rather than browser-owned query data.
4. Provide a backend-owned path that can resolve validated Keycloak identity into downstream trusted execution surfaces without making browser-owned tenant hints authoritative.

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
8. Any downstream execution surface that trusts Keycloak-derived identity must keep user or service-actor provenance auditable alongside the platform request context.
