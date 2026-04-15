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

1. Public-web consumes anonymous, public-safe plan listing from backend-owned subscriber journey HTTP routes.
2. Public-web may initiate auth start and hosted checkout handoff through backend-owned endpoints, but it must not become a client-owned billing system.
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
