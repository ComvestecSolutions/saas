# Notification-Center In-App Notification State

Status: accepted

## Purpose

Close the next ownership gap in `notification-center` by defining the durable actor-scoped in-app inbox model that future first-party product surfaces and backend-owned operator workflows will consume without turning email receipts or external channel adapters into the source of truth for interactive notification state.

## Scope

1. A Convex-backed notification-center in-app notification store keyed by tenant context, actor identity, channel, and notification family.
2. The first accepted in-app state vocabulary: `unread`, `read`, and `dismissed`.
3. The first accepted in-app notification family: `billing.invoice-ready`, using bounded `title`, `body summary`, `action label`, and `action URL` fields derived from the existing invoice-ready workflow.
4. Backend-owned first-party helper surfaces for listing one actor inbox and mutating read or dismissed state without direct storage writes from routes or UI code.
5. One backend-owned admin inspection workflow for a single in-app notification by id, including bounded actor-safe content metadata.
6. A producer contract that requires actor-targeted routing context before any module can emit an in-app notification.

## Non-Goals

1. Push, SMS, or other non-email channel orchestration.
2. End-user preference management for in-app delivery.
3. UI layout, unread-badge visuals, or browser-only notification behavior.
4. Cross-actor shared inboxes or tenant-global announcement feeds.
5. Replacing audit logs, email receipts, or compliance exports with inbox state.

## Ownership Model

1. `notification-center` owns durable in-app notification records and read or dismissed state transitions.
2. Convex is the source of truth for interactive actor-scoped inbox state because this is live product state, not an operator-governance ledger.
3. Modules that produce business events must call notification-center through shared services; they must not write inbox rows directly.
4. `email-delivery` and external channel adapters remain separate boundaries. An in-app notification may correlate to other channel attempts, but it does not replace their durable receipts.
5. Audit evidence for privileged reads or mutations continues to flow through audit and field-security boundaries rather than analytics or inbox state.

## Producer Contract

1. Every emitted in-app notification must include tenant scope, tenant scope id, actor id, source module id, notification family, channel `in-app`, created-at timestamp, and a stable source-event id for idempotent writes.
2. Producers may additionally provide bounded structured presentation fields needed by first-party product surfaces: title, body summary, action label, and action URL.
3. Producers must not persist rendered HTML, unbounded payload blobs, or channel-provider response objects in inbox state.
4. A producer may only emit an in-app notification when it can resolve a real actor id within the target tenant context. Email-only recipients or unresolved external contacts are not valid in-app targets.
5. The first accepted producer rollout is `billing.invoice-ready`, which may persist a bounded title, a bounded body summary naming the invoice number and amount due, a bounded action label, and the existing invoice URL.
6. Producer-specific rollout beyond `billing.invoice-ready` still requires either an accepted follow-up spec for that notification family or an accepted update to this spec that names the new family and its bounded payload fields.

## In-App Notification Shape

1. Each in-app notification record includes notification id, source-event id, source module id, tenant scope, tenant scope id, actor id, channel, notification family, status, created-at timestamp, and updated-at timestamp.
2. Records may additionally store bounded title, body summary, action label, action URL, correlation id, and an optional correlated receipt or digest-run id when another notification-center workflow already owns that linked state.
3. `readAt` is required when status is `read`.
4. `dismissedAt` is required when status is `dismissed`.
5. `dismissed` is terminal for the initial accepted model; reopening or undelete behavior is out of scope until a follow-up spec exists.

## Delivery And Mutation Rules

1. Notification creation is idempotent by tenant context, actor id, channel, notification family, and source-event id.
2. New notifications enter the inbox as `unread`.
3. Mark-read transitions may only change `unread` to `read` and must record `readAt`.
4. Dismiss transitions may change `unread` or `read` to `dismissed` and must record `dismissedAt`.
5. Repeated mark-read or dismiss requests are idempotent and return the current durable record instead of failing.
6. Listing surfaces must default to newest-first ordering and a bounded page size.
7. Inbox-state mutations must enforce tenant isolation and actor ownership at the shared-service layer, not in UI code.

## Operator And First-Party Surfaces

1. First-party product routes and server functions consume root-safe helpers that list the current actor inbox and mutate read or dismissed state through the shared notification-center service.
2. Backend-owned admin inspection may fetch one in-app notification by id when an authenticated operator has `notification:manage` on the target tenant context, with cross-tenant access limited to the existing privileged break-glass path.
3. Admin inspection responses may include bounded content metadata, actor id, source module id, source-event id, status, correlated receipt or digest identifiers, and lifecycle timestamps.
4. Missing notification ids return a typed not-found error.

## Follow-Up Work

1. Implement the Convex-backed in-app store, first-party helper surface, and backend-owned admin inspection after this accepted ownership spec lands.
2. Add producer-specific families beyond `billing.invoice-ready` only when the producer can provide actor-targeted routing context and bounded payload fields.
3. Add push, SMS, and other non-email channel orchestration only after channel-specific accepted specs define credential, routing, and durable-state ownership.
