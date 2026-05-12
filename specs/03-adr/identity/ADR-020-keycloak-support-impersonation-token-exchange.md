# ADR-020 Keycloak Support Impersonation Token Exchange

Status: accepted

## Decision

Use Keycloak token exchange on the platform confidential client as the backend-owned support impersonation mechanism.

Support impersonation starts from an authenticated support or platform operator session, but the issued downstream identity must be a Keycloak-backed session for the impersonated actor rather than a caller-local request-context rewrite. The support-operations module must request the impersonation token from Keycloak, validate the returned session identifiers, and then build an impersonated request context whose `actorId`, `actorType`, `sessionId`, and tenant reflect the impersonated actor while the approving operator, reason, and target actor remain explicit in `requestContext.impersonation` and the emitted audit event.

Break-glass remains a separate control. Support impersonation does not imply field-security bypass, cross-tenant break-glass, or silent authorization overrides. Downstream modules continue to authorize the impersonated request context, while explainability and audit remain explicit about impersonation.

## Rationale

1. Keycloak is already the source of truth for authentication and session lifecycle, so impersonation should mint a real Keycloak-backed session rather than inventing a second session authority inside the platform.
2. Backend-owned support workflows cannot depend on end-user credentials. Token exchange allows the platform client to mint temporary impersonation identity without asking the user for a password or embedding a second identity provider.
3. The existing request-context model already carries explicit impersonation provenance. Reusing that shape keeps authorization explainability, field-security audit, and tenant-isolation behavior consistent with the rest of the platform.
4. The identity-session module and admin-governance surfaces now share the same session-backed provenance binding, so support impersonation should build on that trusted boundary instead of creating another one-off transport contract.

## Consequences

1. The Keycloak adapter must expose a typed impersonation token-exchange method that returns both an ID token for downstream use and a validated Keycloak session for provenance binding.
2. Support-operations must reject impersonation results whose validated Keycloak subject does not match the requested impersonated actor.
3. Support impersonation sessions remain time-bounded. In the current backend-ready slice, the support-operations module caps the effective expiry to the lower of the declared module max-duration default and the Keycloak token lifetime returned by token exchange; future admin or HTTP surfaces can layer runtime-config-backed overrides on top of that same contract.
4. Support impersonation continues to require explicit approval metadata and audit emission. Future admin-app or HTTP review and revocation surfaces can build on the same typed impersonation grant instead of re-encoding the workflow.
5. Break-glass review, support case metadata, and impersonation inventory or revocation remain follow-up work even after the Keycloak-backed impersonation primitive exists.
