# Notification-Center Newsletter Email

Status: accepted

## Purpose

Define the first code-owned newsletter email template contract for `notification-center` so the platform has a reviewable, email-safe editorial surface that still flows through the shared `email-delivery` boundary.

## Scope

1. A stable `notification-center.newsletter` template identifier and versioned tracking identifier owned by `email-delivery`.
2. A typed render contract for the newsletter email subject, HTML, and plaintext content.
3. Support for an issue label, publication timestamp, web-view URL, newsletter preference or unsubscribe URL, and a bounded list of structured article highlights.
4. Shared template output that can later flow through `notification-center` orchestration, recipient preference enforcement, and the existing tenant-branding-aware `email-delivery` sender path.

## Non-Goals

1. Multi-variant A/B testing, hidden segmentation logic, or provider-authored marketing automation.
2. Welcome campaign, MFA code, or verification-email template ownership.
3. Operator-authored newsletter composition UI or database-backed HTML storage.
4. Analytics pixel ownership, campaign scoring, or unbounded article-body persistence in `email-delivery`.

## Ownership Model

1. `notification-center` owns future newsletter orchestration, recipient preference enforcement, and any future durable publish-run or receipt state for sends.
2. `email-delivery` owns the stable template identifier, version string, typed render contract, tracked template identifier, provider handoff, and delivery-state ownership.
3. Sender identity and approved email chrome resolve through `tenant-branding`.
4. Rendered email bodies remain code-owned and reviewable in source; rendered output is not stored durably.

## Render Contract

1. The typed input includes recipient email, issue label, publication timestamp, web-view URL, newsletter preference or unsubscribe URL, and a bounded list of highlight entries made of title, summary, and article URL.
2. The subject communicates the issue label clearly and must remain compatible with email-safe editorial layouts.
3. The template communicates the issue summary, highlight list, read-online path, and recipient preference-management path in both HTML and plaintext forms.
4. The input must not include hidden audience metadata, unpublished branding assets, provider-only analytics tags, or unbounded article-body payloads.

## Follow-Up Work

1. Add an accepted producer-workflow spec for newsletter publish orchestration and recipient-consent ownership before wiring dispatch.
2. Add richer editorial variants only after the publish-run and consent model is accepted.
