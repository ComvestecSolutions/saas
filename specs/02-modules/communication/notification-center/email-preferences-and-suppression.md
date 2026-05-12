# Notification-Center Email Preferences And Suppression

Status: accepted

## Purpose

Close the next durable-state gap in `notification-center` by adding tenant-aware email delivery preferences for exact recipient and template pairs, then enforcing those preferences in the existing `billing.invoice-ready` notification flow without introducing UI-owned policy checks or internal HTTP hops.

## Scope

1. A PostgreSQL-backed notification-center-owned email preference record keyed by tenant scope, tenant scope id, normalized recipient email address, email channel, and stable template id.
2. Operator-managed inspect and upsert workflows over backend-owned transport for exact email preference records.
3. Dispatch-time enforcement for the existing `billing.invoice-ready` notification-center workflow.
4. Durable notification-center receipt support for suppression outcomes when a disabled preference prevents orchestration.
5. Operator inspection that continues to apply notification-center field-security projection and sensitive-read audit behavior for regulated-sensitive recipient values.

## Non-Goals

1. End-user self-service preference management.
2. Digest scheduling or batching.
3. Push, SMS, or other non-email channel adapters.
4. Wildcard preference categories beyond exact template ids.
5. Preference inheritance across tenants or caller-supplied bypass flags.

## Preference Ownership

1. `notification-center` owns durable email preference records for its own orchestration decisions.
2. Preference records control whether notification-center may attempt an email-channel orchestration for one exact recipient and template under one tenant context.
3. `email-delivery` remains the owner of provider-delivery tracking, suppression caused by provider events, and provider-event reconciliation.
4. Notification-center preference records must not duplicate provider bounce or complaint state.
5. Preference mutations must remain auditable through the shared audit-log surface.

## Preference Shape

1. Each preference record includes tenant scope, tenant scope id, normalized recipient, email channel, stable template id, enabled state, updated-by actor id, created-at timestamp, and updated-at timestamp.
2. The first accepted channel vocabulary for preferences is `email` only.
3. The first accepted template vocabulary is the existing shared email template id set.
4. No record means the effective preference is enabled.
5. Exact record matches override the default-enabled behavior only for the same tenant scope, tenant scope id, normalized recipient, channel, and template.

## Operator Management

1. Backend-owned admin communication routes may inspect or upsert one exact email preference record by tenant context, recipient, and template.
2. Preference management requires an authenticated operator session plus backend authorization for `notification:manage` on the target tenant context, with cross-tenant management allowed only through the existing privileged break-glass path.
3. Inspection responses must use the notification-center admin projection and append field-security sensitive-read audit evidence when the regulated-sensitive recipient value remains visible.
4. Upsert responses may return the stored preference record through the same projected admin view.
5. Missing preference inspections return a typed not-found error.

## Dispatch Enforcement

1. The existing `billing.invoice-ready` notification-center workflow must resolve the exact email preference before rendering, provider send, or Novu queueing.
2. When no exact preference exists, dispatch behavior remains unchanged.
3. When an exact preference exists with `enabled = false`, notification-center must not call `email-delivery` or Novu for that notification attempt.
4. A suppressed attempt must persist a notification-center-owned receipt with status `suppressed` so operators can inspect why no orchestration happened.
5. Suppressed receipts must not require an `email-delivery` message id because no provider send occurred.

## Receipt Extension

1. Notification-center email receipts now accept the additional orchestration status `suppressed`.
2. Suppressed receipts may store a bounded suppression reason summary suitable for operator inspection.
3. `emailDeliveryMessageId` becomes optional on notification-center receipts so suppressed outcomes can be represented honestly.
4. Existing `queued` and `queue-failed` receipt behavior stays unchanged.

## Follow-Up Work

1. Add tenant-aware digest scheduling on top of the durable preference model instead of parallel ad hoc state.
2. Add end-user self-service preference management only after a dedicated first-party or external transport spec exists.
3. Extend preference ownership to additional channels only after those channels have accepted ownership specs.
