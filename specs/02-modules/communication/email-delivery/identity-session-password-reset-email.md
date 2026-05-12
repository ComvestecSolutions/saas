# Identity-Session Password Reset Email

Status: accepted

## Purpose

Close the next code-owned template-registry gap in `email-delivery` by defining the shared password reset email template contract for `identity-session`.

## Scope

1. A stable `identity-session.password-reset` template identifier and versioned tracking identifier owned by `email-delivery`.
2. A typed render contract for the password reset email subject, HTML, and plaintext content.
3. Support for an optional public-safe display-name hint so branded reset flows can reference platform or tenant identity without exposing unpublished branding state.
4. Shared template output that can later be sent through the existing tenant-branding-aware `email-delivery` sender path and tracked-delivery surface.

## Non-Goals

1. Full password reset dispatch integration with Keycloak or a new first-party reset orchestration flow.
2. Email verification, MFA code, welcome, or newsletter template ownership.
3. Changing the Keycloak-owned reset screen, redirect contract, or token lifecycle.
4. Operator-authored template editing or database-backed template storage.

## Ownership Model

1. `identity-session` owns password reset workflow initiation, request provenance, and future dispatch integration.
2. `email-delivery` owns the stable template identifier, version string, typed render contract, and tracked template identifier.
3. When platform-owned delivery sends this template, sender identity and approved email chrome still resolve through `tenant-branding` rather than an identity-only branding store.
4. Rendered email bodies remain code-owned and reviewable in source; rendered output is not stored durably.

## Render Contract

1. The typed input includes recipient email, reset URL, expiry timestamp, an optional request timestamp, and an optional public-safe display-name hint.
2. The subject may fall back to generic password reset copy when no display-name hint is available.
3. The template communicates the reset request, secure continuation URL, expiry information, and ignore-if-not-you guidance in both HTML and plaintext forms.
4. The input must not include passwords, raw secret reset tokens, unpublished branding assets, or other secret identity-provider state.

## Follow-Up Work

1. Wire `identity-session` or an approved identity-boundary integration to render and send this template through the shared `email-delivery` service.
2. Wire the adjacent verification-email and MFA-code templates through approved identity-session producer workflows when those dispatch paths are accepted.
