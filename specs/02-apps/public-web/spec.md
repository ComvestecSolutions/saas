# Public Web Spec

Status: accepted

## Responsibilities

1. Landing pages, platform brand presence, and tenant-branded public entry points.
2. Product positioning, pricing, trust, and compliance signals.
3. Documentation and contact entry points.
4. Public-safe plan discovery and self-serve subscription entry points.
5. Lead capture and future product discovery.
6. Platform-owned subdomain entry points and optional tenant custom-domain entry points resolved outside the app.

## First Backend-Ready Slice

1. Public-web consumes anonymous, public-safe plan listing through shared subscriber-journey backend functions invoked from route-owned server data or server functions; the backend-owned HTTP layer remains available for true external callers.
2. Public-web may initiate auth start and hosted checkout handoff through shared server-owned backend services, and auth-start route handlers must stay thin request-boundary edges over shared platform helpers so callback URI validation, callback-state generation, correlation propagation, and transport shaping do not drift into app-local code.
3. Return and cancel pages may confirm status only; entitlement activation must come from verified backend webhook processing.
4. Public-web may hand off into product-app only after a backend session and tenant context exist.

## Rules

1. Keep it decoupled from internal admin concerns.
2. Expose documentation and status links clearly.
3. Reuse shared design primitives without inheriting product-only complexity.
4. Public routes must consume the public-safe `tenant-branding` projection instead of owning per-page branding state.
5. Host resolution, TLS termination, and domain verification remain outside route components.
6. Public rendering must fall back to platform defaults when tenant branding is absent or unentitled.
7. Pricing and plan catalog responses must stay public-safe and must not expose operator-only billing metadata.
8. Hosted checkout start and return flows must stay server-owned and auditable.
9. Public auth-start routes must reuse shared request-boundary and platform service helpers instead of introducing app-local query, response, or correlation transport code.
