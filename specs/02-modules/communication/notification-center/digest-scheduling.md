# Notification-Center Digest Scheduling

Status: accepted

## Purpose

Close the next durable-state gap in `notification-center` by allowing eligible email-channel notifications to batch into module-owned digest windows under runtime-config control instead of forcing immediate orchestration for every notification event.

## Scope

1. A PostgreSQL-backed notification-center digest-candidate ledger and digest-run ledger.
2. Workflow-jobs-backed digest scheduling and execution keyed by tenant context, recipient, channel, and digest family.
3. The first accepted digest family is `billing.invoice-ready` for the email channel.
4. One backend-owned admin inspection workflow returns one digest run with a bounded item summary by digest-run id.
5. Digest enablement and cadence resolve through the existing `notification-center.digest.intervalMinutes` runtime config key.

## Non-Goals

1. In-app notification state or actor-scoped inbox ownership.
2. Push, SMS, or other non-email channel adapters.
3. End-user self-service delivery-mode management.
4. Cross-template or cross-recipient digests.
5. Duplicating `email-delivery` ownership of rendered email content, provider delivery tracking, or provider-event reconciliation.

## Digest Activation

1. `notification-center.digest.intervalMinutes` now means the active digest-window length in minutes.
2. A value of `0` disables digest scheduling and preserves the current immediate orchestration path.
3. A positive effective value enables digest scheduling for accepted digest families in the target tenant context without a redeploy.
4. The first accepted digest family is `billing.invoice-ready`; other templates remain on the existing immediate path until their own accepted follow-up specs exist.

## Ownership Model

1. `notification-center` owns digest-candidate records and digest-run records.
2. Digest candidates represent notification-center-owned pending orchestration state before a digest email send occurs.
3. `email-delivery` remains the sole owner of rendered digest email content, provider handoff, provider-event reconciliation, and suppression state.
4. Workflow-jobs owns the shared scheduling and execution control-plane records, while `notification-center` owns the authoritative module record for digest-window state and completion.
5. This workflow must not introduce internal HTTP hops.

## Digest Candidate Shape

1. Each digest candidate record includes a candidate id, source notification id, tenant scope, tenant scope id, channel, recipient, source template id, digest template id, window-ends-at timestamp, created-at timestamp, and updated-at timestamp.
2. Candidate records may additionally store only the bounded structured fields needed to render the first digest family: invoice number, invoice URL, due-at timestamp, and total-due string.
3. Candidate records must not persist rendered HTML, plaintext email bodies, raw provider payloads, or unbounded error blobs.
4. Candidate records remain immutable except for digest-run linkage and terminal timestamps such as digested-at or canceled-at.

## Digest Run Shape

1. Each digest run record includes a digest-run id, tenant scope, tenant scope id, recipient, channel, digest template id, scheduled-at timestamp, optional started-at timestamp, optional completed-at timestamp, status, item count, and created-at or updated-at timestamps.
2. The first accepted digest-run status vocabulary is `scheduled`, `running`, `queued`, `queue-failed`, `failed`, and `canceled`.
3. Queued and queue-failed digest runs may store the correlated `email-delivery` message id and Novu queue receipt id when those side effects occurred.
4. Failed or queue-failed digest runs may store only bounded operator-safe failure summaries.

## Dispatch Rules

1. Notification-center must resolve the existing exact email preference for `billing.invoice-ready` before deciding whether a source event is eligible for digest scheduling.
2. When the exact email preference is disabled, the existing suppressed receipt behavior remains unchanged and no digest candidate is created.
3. When digest scheduling is disabled, the existing immediate email and receipt behavior remains unchanged.
4. When digest scheduling is enabled, notification-center persists a digest candidate and ensures one digest workflow for the matching tenant context, recipient, channel, and digest window instead of sending an immediate email.
5. Digest workflow execution loads all pending candidates in the target window, renders one digest email through a new shared template id `billing.invoice-ready-digest`, sends that email through `email-delivery`, queues the notification through Novu, and then persists one standard notification-center email receipt for the digest send outcome.
6. On `queued` or `queue-failed` digest completion, all included candidates must link to the terminal digest run and record a digested-at timestamp.
7. When the digest email send fails before provider handoff, notification-center must not create an orphan receipt; instead the digest run records `failed` and the candidates remain eligible for shared workflow repair-gap replay or operator-triggered cancellation.
8. Repair-gap replay must treat the module-owned digest run record as authoritative over stale workflow rows rather than replaying or downgrading a terminal digest outcome.

## Operator Inspection

1. Backend-owned admin communication routes may inspect one digest run by digest-run id.
2. Inspection requires an authenticated operator session plus backend authorization for `notification:manage` on the target tenant context, with cross-tenant inspection allowed only through the existing privileged break-glass path.
3. Inspection responses must use the notification-center admin projection and append field-security sensitive-read audit evidence when the regulated-sensitive recipient remains visible.
4. Inspection responses may include the bounded source-item summary, correlated `email-delivery` message id, correlated receipt id, and the list of included source notification ids.
5. Missing digest-run ids return a typed not-found error.

## Follow-Up Work

1. Add in-app notification state only after a producer supplies actor-targeted routing context and a dedicated accepted ownership spec exists for durable inbox state.
2. Add push, SMS, or other non-email channel orchestration only after those channel-specific credential, routing, and durable-state ownership rules have accepted specs.
3. Add end-user delivery-mode management only after a dedicated first-party or backend-owned policy-management spec exists.
