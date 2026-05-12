# Webhooks Outbound Delivery Retry Design Slice

Status: validated

Last updated: 2026-05-06

## Objective

Define the smallest workflow-jobs-backed outbound delivery slice that moves `webhooks-api-access` beyond subscription registration into real backend-owned delivery execution, retry, and durable operator-recoverable failure handling without introducing module-local schedulers or unaudited replay paths.

## Scope

1. Operator-requested outbound webhook delivery for an existing subscription.
2. PostgreSQL-backed outbound delivery logs with attempt counters, status, failure detail, and next-attempt timing.
3. Shared workflow-jobs orchestration for delivery execution, retry, replay, and cancellation.
4. Session-backed admin service and backend-owned HTTP transport that enqueue a delivery workflow job and return durable job or delivery summaries.

## Non-Goals

1. Automatic fan-out from every product-domain event to all matching subscriptions.
2. New frontend or admin UI work beyond the existing backend-owned HTTP surface.
3. Per-subscription credential provisioning beyond the current webhook subscription URL ownership model.
4. Replacing the shared workflow-jobs repair-gap owner surfaces with module-local retry or replay APIs.

## Ownership Model

1. `webhooks-api-access` owns outbound delivery records, attempt metadata, payload storage, and subscription `lastDeliveryAt` updates.
2. `workflow-jobs` remains the only owner of scheduling, replay, cancellation, and blocked-job lifecycle control.
3. The shared admin webhooks service owns trusted-session authorization, audit evidence, and operator request shaping.
4. Delivery payloads remain tenant-confidential and are never surfaced through broad admin list views by default.

## Required Runtime Slice

1. Contracts: add schema-backed outbound delivery records, request inputs, and workflow payloads for webhook delivery execution.
2. Persistence: add PostgreSQL-backed delivery-log ownership beside the existing webhook-subscription and API-key repositories.
3. Workflow orchestration: add a dedicated webhook outbound delivery workflow kind and Convex dispatch or execution wiring through the shared workflow-jobs path.
4. Services: add a shared backend service that requests outbound deliveries for a subscription, persists durable delivery state, and executes retries with exponential backoff.
5. Transport: add backend-owned admin HTTP routes and OpenAPI documentation for operator-requested delivery execution over the trusted-session admin surface.

## Retry And Failure Rules

1. Failed outbound deliveries must reschedule through `workflow-jobs`, never through ad hoc timers or in-memory retry loops.
2. Retry budgets must come from `webhooks-api-access.delivery.maxRetries` rather than duplicated literals.
3. Delivery failures below the retry budget must persist the latest failure detail and next scheduled attempt before rescheduling.
4. Exhausted retries must leave durable repair-gap evidence that can be inspected, replayed, or canceled through the shared workflow-jobs owner surface.
5. Successful deliveries must update the subscription `lastDeliveryAt` field and close the delivery log without reopening older attempts.

## Security Rules

1. Operator-requested delivery execution must reuse the same trusted-session authorization path already used for webhook subscription and API-key management.
2. Delivery payloads must be decoded at the backend boundary and stored only in durable module-owned records, not in transient UI-only state.
3. Cross-tenant delivery execution must deny access unless a valid, unexpired privileged break-glass context exists.
4. Delivery logs and workflow repair-gap reads must remain auditable when sensitive fields are visible to privileged operators.

## Implementation Order

1. Add contract and spec coverage for outbound delivery records, request inputs, and workflow payloads.
2. Add PostgreSQL tables and repository support for delivery logs plus subscription `lastDeliveryAt` updates.
3. Add the webhook outbound delivery workflow kind, Convex dispatch hooks, and shared workflow execution path.
4. Extend the shared admin webhooks service and backend-owned HTTP transport with operator-requested delivery execution.
5. Add focused repository, service, HTTP, workflow, and backend API tests before wiring broader event fan-out.

## Validation Bar

1. Tests must prove failed deliveries reschedule through the shared workflow-jobs path with durable retry counters and next-attempt timestamps.
2. Tests must prove exhausted retries surface a durable blocked repair gap instead of silently dropping the delivery.
3. Tests must prove successful deliveries update `lastDeliveryAt` without reopening stale attempts.
4. Repository-wide validation remains `bun run format:check`, `bun run typecheck`, and `bun run test` before tracker evidence moves.
5. This slice completed a distinct `SaaS Foundation Steward` pass on 2026-05-06 before the tracker and overview moved to `validated`.
