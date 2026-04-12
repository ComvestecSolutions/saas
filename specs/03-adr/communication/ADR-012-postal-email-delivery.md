# ADR-012 Postal Email Delivery

Status: accepted

## Decision

Use Postal as the self-hosted transactional email delivery service. The platform adapter wraps Postal behind an email-delivery boundary so the implementation can swap to Resend, Postmark, or SES without code changes outside the adapter.

## Rationale

1. Self-hostable, satisfying the open-source dependency policy (ADR-005).
2. Provides SMTP relay, delivery tracking, and bounce handling out of the box.
3. The adapter boundary means cloud email providers are a configuration swap, not a code rewrite.
4. Keeps email delivery as a platform-level concern rather than application-specific code.
