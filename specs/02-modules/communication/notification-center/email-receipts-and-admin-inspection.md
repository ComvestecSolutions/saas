# Notification-Center Email Receipts And Admin Inspection

Status: accepted

## Purpose

Close the first durable-state gap in `notification-center` by recording module-owned email-channel notification receipts for the existing `billing.invoice-ready` workflow and exposing an operator-safe inspection path over the shared backend transport.

## Scope

1. A PostgreSQL-backed notification-center receipt ledger for email-channel orchestration records.
2. The first producer is the existing `billing.invoice-ready` notification-center workflow only.
3. Receipt state captures notification-center queue success or queue failure while linking back to the shared `email-delivery` message id that carried the actual email send, and the same receipt model can later extend to suppressed outcomes that happen before provider handoff.
4. A backend-owned admin inspection workflow returns one notification receipt by id through the module's declared admin projection.
5. Operator inspection applies the module manifest's field classifications and audit requirements for regulated-sensitive recipient data.

## Non-Goals

1. Digest scheduling, digest batching, or replay workflows.
2. Convex-backed in-app notification state.
3. Push, SMS, or additional non-email channel adapters.
4. A notification-center-owned provider delivery-tracking store that duplicates `email-delivery` ownership.
5. Bulk query, search, or operator triage surfaces beyond point inspection by receipt id.

## Receipt Ownership

1. `notification-center` owns one durable receipt record per attempted notification-center dispatch.
2. The receipt record captures notification orchestration state, not provider delivery state.
3. `email-delivery` remains the sole owner of provider-delivery tracking, suppression, and provider-event reconciliation.
4. Notification-center receipts must store the `email-delivery` message id used for the email send when provider delivery occurred so operators can correlate the orchestration receipt with the delivery record.
5. Notification-center must not persist rendered HTML or plaintext email bodies.

## Receipt Shape

1. Each receipt record includes a durable notification id, tenant scope, tenant scope id, channel, recipient, stable template id, orchestration status, created-at timestamp, and updated-at timestamp; the correlated email-delivery message id is required only when a provider send occurred.
2. Email-channel receipts may additionally store the Novu queue receipt id when queueing succeeds.
3. Queue-failed receipts may store a bounded queue-failure summary for operator inspection, but they must not persist raw stack traces or unbounded provider payloads.
4. The first accepted channel vocabulary is `email` only.
5. The first accepted orchestration status vocabulary is `queued` and `queue-failed`; later accepted follow-up specs may extend that vocabulary without changing receipt ownership.

## Billing Invoice Ready Persistence

1. The existing notification-center `billing.invoice-ready` workflow continues to render and send email through the shared `email-delivery` service before writing the notification-center receipt.
2. When the email send succeeds and the Novu queue succeeds, notification-center persists a `queued` receipt linked to both the stable template id and the email-delivery message id.
3. When the email send succeeds but the Novu queue fails, notification-center still returns the existing partial-success outcome and persists a `queue-failed` receipt linked to the email-delivery message id.
4. When the email send fails, notification-center must not create an orphan notification-center receipt because no notification-center orchestration completed.
5. This workflow must not introduce internal HTTP hops.

## Operator Inspection

1. Backend-owned admin communication routes may inspect one notification-center receipt by notification id.
2. Inspection reads must require an authenticated operator session plus backend authorization for `notification:manage` on the target tenant context, with cross-tenant inspection allowed only through the existing privileged break-glass path.
3. Inspection reads that expose the recipient field must apply the module's declared admin projection and append field-security sensitive-read audit evidence for that regulated-sensitive value.
4. Inspection responses may include the correlated `email-delivery` message id so operators can continue investigation through the existing email-delivery inspection surface.
5. Missing receipt ids return a typed not-found error instead of silently succeeding.

## Follow-Up Work

1. Add summary or list inspection surfaces after the point-inspection receipt ledger is stable.
2. Add digest scheduling on top of the durable receipt and preference model rather than parallel ad hoc state.
3. Add in-app, push, or SMS channel orchestration only after those channel-specific ownership rules have accepted specs.
