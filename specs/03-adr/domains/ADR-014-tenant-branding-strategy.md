# ADR-014 Tenant Branding Strategy

Status: accepted

## Decision

Use a dedicated `tenant-branding` module to own white labeling across the public web, product app, admin app, email delivery, notification center, and identity/session surfaces.

Resolve branding values through the existing runtime-config cascade, with `platform`, `enterprise`, and `organization` as the default override scopes. Treat tenant-specific branding as a billable capability whose overrides apply only after entitlement succeeds.

Store branding assets in Convex through `file-storage`. Store custom-domain verification state, sender identity metadata, approval history, and audit records in PostgreSQL. Treat custom domains as a deployment-edge capability rather than an app-owned routing concern.

## Rationale

1. White labeling is cross-cutting. Scattering it across individual apps or downstream modules would create duplicate stores, duplicate permissions, and inconsistent fallback behavior.
2. Reusing the existing runtime-config cascade keeps branding aligned with the current governance model for overrides, approvals, and no-redeploy activation.
3. Splitting asset bytes from operational state follows the platform's existing Convex/PostgreSQL ownership model and keeps auditable records out of app-local state.
4. `enterprise` and `organization` are the correct default override scopes because branding is typically managed at the customer account or business-unit boundary, not per individual user.
5. Treating custom domains as a deployment-edge concern keeps TLS, certificate issuance, and hostname routing out of route components and allows different deployment profiles to satisfy the same contract.
