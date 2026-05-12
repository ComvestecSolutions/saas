# Identity-Session Email Verification Email

Status: accepted

## Purpose

Close the next code-owned template-registry gap in `email-delivery` by defining the shared email verification template contract for `identity-session`.

## Scope

1. A stable `identity-session.email-verification` template identifier and versioned tracking identifier owned by `email-delivery`.
2. A typed render contract for the email verification subject, HTML, and plaintext content.
3. Support for an optional public-safe display-name hint so branded verification flows can reference platform or tenant identity without exposing unpublished branding state.
4. Shared template output that can later be sent through the existing tenant-branding-aware `email-delivery` sender path and tracked-delivery surface.

## Non-Goals

1. Full verification-email dispatch integration with Keycloak or a first-party signup or profile-update workflow.
2. MFA code, welcome, or newsletter template ownership.
3. Changing verification token lifecycle, redirect validation, or identity-provider-owned verification screens.
4. Operator-authored template editing or database-backed template storage.

## Ownership Model

1. `identity-session` owns verification workflow initiation, request provenance, and future dispatch integration.
2. `email-delivery` owns the stable template identifier, version string, typed render contract, and tracked template identifier.
3. When platform-owned delivery sends this template, sender identity and approved email chrome still resolve through `tenant-branding` rather than an identity-only branding store.
4. Rendered email bodies remain code-owned and reviewable in source; rendered output is not stored durably.

## Render Contract

1. The typed input includes recipient email, verification URL, expiry timestamp, an optional request timestamp, and an optional public-safe display-name hint.
2. The subject may fall back to generic verification copy when no display-name hint is available.
3. The template communicates the verification request, secure continuation URL, expiry information, and ignore-if-not-you guidance in both HTML and plaintext forms.
4. The input must not include raw provider session state, unpublished branding assets, or other secret identity-provider state.

## Follow-Up Work

1. Wire `identity-session` or an approved identity-boundary integration to render and send this template through the shared `email-delivery` service.
2. Add email-change or secondary-contact verification variants only after accepted producer-flow specs define those workflows explicitly.
