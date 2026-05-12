# Notification-Center Welcome Campaign Email

Status: accepted

## Purpose

Define the first code-owned welcome-campaign email template contract for `notification-center` so the platform has a reviewable onboarding-style engagement email family that still flows through the shared `email-delivery` boundary.

## Scope

1. A stable `notification-center.welcome-campaign` template identifier and versioned tracking identifier owned by `email-delivery`.
2. A typed render contract for the welcome campaign email subject, HTML, and plaintext content.
3. Support for an optional public-safe display-name hint, one primary action URL, one support URL, an optional send timestamp, and a bounded next-step checklist.
4. Shared template output that can later flow through `notification-center` orchestration, exact-template preference enforcement, and the existing tenant-branding-aware `email-delivery` sender path.

## Non-Goals

1. Multi-step campaign sequencing, scheduled nudges, or nurture-drip automation.
2. Newsletter, MFA code, or verification-email template ownership.
3. Subscription or consent persistence beyond the existing notification-center preference model.
4. Operator-authored WYSIWYG templates or database-backed campaign storage.

## Ownership Model

1. `notification-center` owns future welcome-campaign orchestration, exact-template preference enforcement, and any future durable receipt state for sends.
2. `email-delivery` owns the stable template identifier, version string, typed render contract, tracked template identifier, provider handoff, and delivery-state ownership.
3. Future producer surfaces may trigger this family through accepted event contracts, but they do not own the delivery pipeline.
4. Sender identity and approved email chrome resolve through `tenant-branding`.
5. Rendered email bodies remain code-owned and reviewable in source; rendered output is not stored durably.

## Render Contract

1. The typed input includes recipient email, one primary action URL, one support URL, an optional send timestamp, an optional public-safe display-name hint, and a bounded list of next-step strings.
2. The subject may fall back to generic welcome copy when no display-name hint is available.
3. The template communicates the welcome intent, one clear next action, a short checklist, and one support path in both HTML and plaintext forms.
4. The input must not include hidden segmentation scores, experimental audience metadata, unpublished branding assets, or unbounded prose blobs.

## Follow-Up Work

1. Add an accepted producer-workflow spec for when welcome-campaign sends are triggered.
2. Add sequenced follow-up or nurture variants only after a dedicated scheduling and consent spec exists.
