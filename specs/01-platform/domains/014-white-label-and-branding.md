# 014 White Label and Branding

Status: accepted

## Purpose

1. Define a single platform model for tenant-resolved white labeling across the public web, product app, admin app, email delivery, notification center, and identity/session surfaces.
2. Keep branding reviewable, auditable, billable, and scope-aware instead of embedding per-app branding logic.

## Capability Boundary

1. White labeling includes approved visual branding, public-safe company copy, support contact metadata, branded email sender identity, login/session branding handoff, and optional custom domains.
2. White labeling is owned by the `tenant-branding` module and consumed by applications and downstream modules.
3. White labeling does not permit arbitrary CSS, JavaScript, HTML, or template code injection.
4. White labeling is a platform capability, not a separate storage or permission model per app.

## Scope Resolution

1. Effective branding resolves through the existing tenant cascade defined in [006 Config, Permission, and Feature Governance](006-config-permission-and-feature-governance.md).
2. The default allowed override scopes for white-label config are `platform`, `enterprise`, and `organization`.
3. `individual` overrides are excluded unless a later accepted spec explicitly opts a branding key into that scope.
4. Because `individual` is excluded by default, effective `tenant-branding` values typically resolve in this order: `organization > enterprise > platform`.
5. Public-facing renders must consume public-safe projections of effective branding. Admin inspection surfaces may consume richer admin projections.

## Branding Surface

1. Shared branding tokens may include company name, logo and favicon asset references, approved color tokens, approved typography tokens, and safe public copy fields.
2. Email-facing branding may include sender display name, reply-to address, footer identity, and approved email chrome assets.
3. Identity/session branding may include logo, tenant display name, and approved theme variant handoff to Keycloak-owned login or reset pages.
4. Custom domains include requested hostnames, hostname-to-tenant mapping inputs, DNS or proof requirements, lifecycle state, and approval history.

## Identity Handoff

1. The default identity/session handoff pattern is branded redirects around Keycloak-owned flows.
2. Public or product surfaces resolve tenant branding and host context before redirecting into login or reset flows.
3. Redirect handoff payloads contain only public-safe or internal routing hints, never secret branding state.
4. Static Keycloak theme alignment may exist as a deployment concern, but runtime tenant branding is not theme-owned by default.

## Billing and Entitlement

1. White labeling is a billable platform capability and must pass entitlement checks before tenant-specific overrides apply.
2. Subfeatures such as branded emails and custom domains may be separately billable within the `tenant-branding` module.
3. A tenant without entitlement falls back to the platform brand even if organization or enterprise overrides exist in storage.
4. No app, module, or operator workflow may use a branding override to bypass entitlement.

## Data Ownership

1. Published brand assets and asset metadata live in Convex via the `file-storage` module.
2. Domain verification state, approval history, sender identity metadata, and audit records live in PostgreSQL.
3. Effective public branding projections may be cached aggressively, but unpublished assets and admin-only verification data remain non-public.
4. `tenant-branding` owns semantic selection and projection rules. `file-storage`, `email-delivery`, and `identity-session` remain downstream consumers.

## Domain Lifecycle

1. Custom domains use explicit lifecycle states: `unverified`, `verifying`, `active`, `error`, and `retired`.
2. Hostname mapping, DNS guidance, certificate issuance, and TLS termination are deployment-edge responsibilities.
3. Route components and page loaders consume resolved host context. They do not perform domain verification or certificate management themselves.
4. Domain activation requires verification success, entitlement success, and an auditable approval path.

## Application Expectations

1. The public web supports platform-owned entry points plus optional tenant custom domains.
2. The product app applies effective branding to authenticated shell chrome, navigation, and shared documents through route-owned server data.
3. The admin app manages asset upload workflows, effective-value inspection, entitlement visibility, custom-domain verification state, and approval history.
4. Email delivery, notification center, and identity/session surfaces consume `tenant-branding` projections instead of owning separate branding stores.

## Rules

1. White-label configuration must be declared in manifests and versioned in code.
2. White-label projections must separate public-safe fields from admin-only or secret fields.
3. Branding changes are auditable and must record actor, scope, and approval source.
4. Brand assets follow the platform's retention, deletion, and legal hold rules.
5. Every application must tolerate missing or unentitled branding by falling back to platform defaults.
6. Identity/session branding must use the branded redirect handoff contract unless a later accepted spec defines a stronger alternative.
