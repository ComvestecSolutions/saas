# Notification-Center Billing Invoice Ready Email

Status: accepted

## Purpose

Close the next `email-delivery` template-consumer gap by promoting the existing notification-center `billing.invoice-ready` fixture into a code-owned, versioned email template with a typed render contract.

## Scope

1. A stable `billing.invoice-ready` template identifier and versioned tracking identifier owned by `email-delivery`.
2. A typed render contract for the billing invoice ready email subject, HTML, and plaintext payloads.
3. A notification-center dispatch workflow that renders the billing invoice ready email through `email-delivery` instead of accepting caller-owned raw subject or HTML strings.
4. Delivery tracking that records the versioned template identifier used for the email send while notification queueing keeps the stable notification template identifier.
5. Reuse of the existing tenant-branding-aware sender identity and shared Postal or Novu boundaries.

## Non-Goals

1. A full billing invoice domain workflow, invoice generation pipeline, or new billing operator UI.
2. Broader notification-center preference, digest, in-app, push, or SMS work.
3. Operator-authored template editing or database-backed template storage.
4. Additional notification-center email templates beyond the initial billing invoice ready slice.

## Template Ownership

1. `email-delivery` owns the stable `billing.invoice-ready` template identifier and its version string in committed code.
2. The rendered email body remains code-owned and reviewable; rendered HTML or plaintext must not be stored durably.
3. Notification-center uses the stable template identifier when queueing the notification channel receipt, while email-delivery tracks the versioned template identifier used for the Postal send.

## Billing Invoice Ready Dispatch

1. Notification-center exposes a typed dispatch input for the billing invoice ready workflow rather than raw caller-supplied email subject or HTML strings.
2. The typed input includes the authenticated request context, recipient, invoice reference, invoice URL, due timestamp, and a preformatted total-due display value.
3. Notification-center renders the email content through the shared email-delivery template helper, then sends the rendered email through the shared email-delivery service and queues the matching notification receipt through the shared notification-center module.
4. Notification-center continues to treat Novu queue failure as a partial-success outcome when the email send has already queued successfully.
5. The workflow must not introduce internal HTTP hops or a notification-center-owned email tracking store.

## Follow-Up Work

1. Broaden the code-owned template registry to additional notification-center-backed system emails once more backend-owned consumers are ready.
2. Replace remaining generic notification-center email scaffolding only as each concrete template consumer gains an accepted spec and typed render contract.
