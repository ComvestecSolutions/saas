# ADR-018 H3 Backend HTTP Layer

Status: accepted

## Decision

Use H3 v2 as the canonical backend-owned HTTP adapter layer for standalone platform APIs and external callers.

Bun remains the server runtime. Effect services remain the application and domain boundary. First-party apps continue to call shared backend services directly through TanStack Start server functions, while backend HTTP entrypoints translate web `Request` values into the same shared Effect services and only call `Effect.runPromise(...)` at the H3 edge.

## Rationale

1. The repository already exposes backend-owned subscriber-journey and admin-billing APIs outside TanStack Start, so the platform needs a first-class HTTP layer that is distinct from app SSR routing and direct first-party service calls.
2. H3 works natively with web `Request` and `Response` objects on Bun, which lets the existing Effect-based HTTP handlers migrate without Node compatibility layers.
3. H3 adds explicit route registration and a middleware surface for correlation, authorization, audit, observability, and webhook concerns without pushing business logic into framework code. The repo now centralizes correlation-id injection and fail-open request telemetry in shared request middleware while common JSON or query transport helpers live under `packages/platform/src/services/communication/`.
4. TanStack Start remains the shell framework for public-web, product-app, and admin-app while first-party routes stay thin direct callers of shared backend services and backend-owned APIs stay reusable by tooling, smoke tests, webhook providers, and future operator entrypoints.
5. H3 is already pinned in the repository and preserves a realistic swap path to Hono or raw Bun if the platform later needs a different HTTP layer.

## Consequences

1. New backend-owned HTTP entrypoints live under `packages/platform/src/http/` and compose shared Effect services instead of duplicating orchestration inside apps.
2. The canonical Bun server entrypoint delegates to an H3 app instead of hand-written pathname switching.
3. Request decoding, middleware concerns, exact route-to-method matching, and HTTP error mapping remain backend concerns at the H3 boundary rather than leaking into frontend route code, and they should be factored through shared request-middleware and communication helpers instead of duplicated per handler.
4. TanStack Start app routes continue to act as thin framework edges over shared platform services and may reuse the same shared request-boundary helpers when they need correlation or observability behavior; H3 does not replace the canonical first-party integration path.
5. Existing web handlers may continue to use web-standard `Request` and `Response` semantics, with H3 integrating them through direct mounts or `fromWebHandler` where appropriate.
