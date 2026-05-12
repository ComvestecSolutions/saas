# Email Delivery Tracking And Suppression

Status: accepted

## Purpose

Close the first durable-state gap in `email-delivery` by defining how transactional sends, provider delivery events, and recipient suppression records are owned on the backend.

## Scope

1. PostgreSQL-backed delivery tracking metadata for transactional sends.
2. PostgreSQL-backed recipient suppression records for bounce and complaint enforcement.
3. Shared service and module contracts for recording provider delivery events.
4. Notification-center forwarding of template identifiers into the shared email-delivery path for tracking metadata.
5. Operator-safe projected inspection reads for delivery tracking and recipient suppressions.

## Non-Goals

1. Operator mutation surfaces for delivery tracking or suppression state.
2. Full template authoring or version-management workflows.
3. Provider-specific template-rendering or campaign analytics workflows beyond normalized delivery-status ingestion.

## Durable State

1. `email-delivery` owns PostgreSQL-backed delivery tracking records keyed by message id.
2. Tracking records store only delivery metadata: tenant scope, recipient, provider, sender metadata, template id when known, status, timestamps, and bounce metadata.
3. Tracking records must not persist HTML or plaintext email bodies.
4. `email-delivery` also owns PostgreSQL-backed recipient suppression records keyed by normalized recipient address.
5. Suppression records are platform-level deliverability controls and apply across tenants once a bounce or complaint is accepted.

## Send Flow

1. The shared email-delivery module checks the suppression store before attempting provider delivery.
2. If a recipient is suppressed, the send is rejected before the Postal adapter is called.
3. The module generates the message id used by the adapter and the durable tracking record.
4. The module persists a queued tracking record before calling the provider so failed sends can still leave auditable metadata.
5. If provider delivery fails after the queued record exists, the tracking record moves to `failed`.
6. If provider delivery succeeds, the tracking record remains `queued` until later provider events update it.

## Provider Event Flow

1. Provider delivery events are decoded at the boundary and forwarded into a shared `email-delivery` service or module method.
2. `delivered`, `bounced`, and `complained` are the initial supported provider event states.
3. Bounce events update delivery status and record bounce type.
4. Bounce and complaint events upsert a suppression record for the normalized recipient.
5. Unknown message ids fail with a typed backend error instead of silently creating orphan tracking rows.
6. The first accepted provider event must not be rejected solely because its provider timestamp predates the locally recorded queued or provider-receipt timestamp.
7. Once a provider event is accepted, older or lower-authority events must not regress durable delivery status or overwrite newer event metadata, including tracked-delivery and recipient-suppression records during concurrent ingestion.
8. Non-bounce provider events clear any previously stored bounce metadata on the delivery tracking record.
9. Backend-owned HTTP intake must verify provider authenticity before any normalized event reaches the shared email-delivery service.
10. Provider-specific webhook payloads may be ignored when they do not map safely to the shared delivery-event contract, but signature failures must fail closed.
11. Replay or duplicate provider deliveries must remain safe to reprocess by normalizing onto the shared delivery-event contract and relying on monotonic tracked-delivery and suppression updates.

## Notification Integration

1. `notification-center` continues to reuse the shared email-delivery service for email-channel sends.
2. When `notification-center` dispatches an email notification, it forwards the notification template id into email-delivery tracking metadata.
3. `notification-center` does not own an independent email tracking store.

## Operator Read Surfaces

1. Backend-owned admin communication routes may inspect one tracked delivery by message id and one recipient suppression by normalized recipient lookup.
2. Operator inspection reads must apply the module's declared admin projection through field security before returning payloads.
3. Inspection reads that expose regulated-sensitive recipient values must append field-security sensitive-read audit evidence.
4. Operator inspection reads must require an authenticated operator session plus backend authorization for `email:manage` on the target tenant context, with cross-tenant inspection allowed only through the existing privileged break-glass path.
5. Recipient suppression inspection must derive its tenant authorization target from the owning tracked delivery referenced by `sourceMessageId` rather than treating suppression rows as tenantless data.

## Follow-Up Work

1. Add code-owned template registry and version-management contracts on top of the tracked template identifier path.
2. Broaden operator-safe projected reads beyond point inspection into higher-volume query and triage workflows when search and notification-center phases need them.
