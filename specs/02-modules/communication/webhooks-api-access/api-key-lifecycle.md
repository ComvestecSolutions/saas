# Webhooks API Key Lifecycle Design Slice

Status: validated

Last updated: 2026-05-06

## Objective

Define the smallest backend-owned API-key lifecycle slice that moves `webhooks-api-access` beyond subscription-only management without exposing durable secrets, bypassing trusted session context, or introducing unaudited credential mutation paths.

## Scope

1. Operator-managed API key create, list, rotate, and revoke workflows for tenant-scoped external integrations.
2. PostgreSQL-backed durable API-key metadata and secret-hash ownership.
3. Session-backed admin service and backend-owned HTTP transport for API-key lifecycle operations.
4. One-time secret handoff on create and rotate only.

## Non-Goals

1. Outbound webhook delivery retry or backoff orchestration.
2. Runtime authentication of downstream external API callers against the new keys.
3. Frontend or admin UI work beyond the existing backend-owned HTTP surface.

## Ownership Model

1. `webhooks-api-access` owns durable API-key records, including label, tenant scope, secret hash, prefix, lifecycle timestamps, and audit evidence.
2. Only a hash and non-secret admin metadata persist in PostgreSQL. Plaintext secrets are generated at mutation time and returned exactly once.
3. Platform or support operators manage API keys through the same trusted-session authorization path already used for webhook subscription management.
4. Audit targets identify the API-key lifecycle operation and key identifier, never the plaintext secret or hash value.

## Required Runtime Slice

1. Contracts: add schema-backed records, admin views, and mutation result envelopes for API-key lifecycle operations.
2. Persistence: add a PostgreSQL-backed API-key repository beside the existing webhook-subscription repository.
3. Module: extend `webhooks-api-access` with create, list, rotate, and revoke methods over hash-only secret persistence.
4. Services: extend the shared admin service with session-bound operator access, support-safe admin views, and audit-backed mutations.
5. Transport: extend the backend-owned admin HTTP handler and OpenAPI document with API-key lifecycle routes.

## Security Rules

1. API-key plaintext secrets must never be written to PostgreSQL, audit logs, or admin list views.
2. API-key list and revoke responses expose only non-secret metadata such as key identifier, label, prefix, lifecycle status, and timestamps.
3. Rotating an API key replaces the durable hash and prefix atomically and returns the new plaintext secret exactly once.
4. Revoking an API key marks it unusable durably and audibly; revoked keys remain inspectable through non-secret metadata only.
5. Cross-tenant API-key management must deny access unless a valid, unexpired privileged break-glass context exists.

## Implementation Order

1. Add contract and persistence schemas for API-key records, admin views, and one-time secret mutation results.
2. Add PostgreSQL table and repository support for create, list, rotate, and revoke operations.
3. Extend the module and shared admin service with hash generation, operator authorization, and audit-backed lifecycle mutations.
4. Add backend-owned HTTP routes and OpenAPI documentation for API-key lifecycle operations.
5. Add focused service, HTTP, and backend API tests before widening into outbound delivery retries.

## Validation Bar

1. Tests must prove plaintext secrets are returned only on create and rotate and never in admin list views.
2. Tests must cover rotate and revoke audit behavior plus cross-tenant access denial without break-glass.
3. Repository-wide validation remains `bun run format:check`, `bun run typecheck`, and `bun run test` before tracker evidence moves.
4. This slice completed a distinct `SaaS Foundation Steward` pass on 2026-05-06 before the tracker and next-gap text were promoted.
