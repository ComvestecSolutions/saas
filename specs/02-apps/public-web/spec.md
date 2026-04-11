# Public Web Spec

Status: accepted

## Responsibilities

1. Landing pages, platform brand presence, and tenant-branded public entry points.
2. Product positioning, pricing, trust, and compliance signals.
3. Documentation and contact entry points.
4. Lead capture and future product discovery.
5. Platform-owned subdomain entry points and optional tenant custom-domain entry points resolved outside the app.

## Rules

1. Keep it decoupled from internal admin concerns.
2. Expose documentation and status links clearly.
3. Reuse shared design primitives without inheriting product-only complexity.
4. Public routes must consume the public-safe `tenant-branding` projection instead of owning per-page branding state.
5. Host resolution, TLS termination, and domain verification remain outside route components.
6. Public rendering must fall back to platform defaults when tenant branding is absent or unentitled.
