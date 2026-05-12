# 006 Config, Permission, and Feature Governance

Status: accepted

## Platform Structure

The platform is made up of **modules**. Each module provides **features**. Features are controlled via **config keys** and **feature flags** that live inside that module's namespace. Modules and features within modules can be individually entitled through billing.

1. Module is the namespace and owner of its config keys and feature flags. Module is NOT a scope resolution axis.
2. Whether a module is visible to an individual, organization, or enterprise is itself a config/flag resolved through the tenant hierarchy.
3. Config keys and flags use the module ID as their namespace prefix, for example `billing-and-metering.invoiceRetentionDays` or `notification-center.emailDigest`.

## Module Visibility Pattern

1. Every module must declare a `{moduleId}.enabled` feature flag at minimum.
2. Feature-level flags within a module control finer-grained access, for example `billing-and-metering.advancedReporting`.
3. An enterprise might have a module enabled, but a specific individual within it might have a feature disabled — all resolved through the same cascade.

## Module Manifest Requirement

Each runtime module must declare:

1. config keys with key name, description, JSON schema or Effect Schema type reference, default value, billable flag, allowed override scopes, and owner
2. feature flags with key name, description, owner, purpose, default enabled state, billable flag, allowed override scopes, dependency keys, lifecycle state, and retirement plan
3. permission scopes with description and assignability
4. projection profiles with visible and audited field lists
5. data classifications per field or record type
6. ownership metadata
7. rollout and retirement rules
8. technology boundary when the module wraps an external tool

## Tenant Scope Resolution

Config keys and feature flags resolve through a single axis: the tenant hierarchy. The narrowest applicable scope wins.

### Resolution order

`individual > organization > enterprise > platform`

### Entitlement gate

Features and config keys can be **billable**. If a flag or config key is marked `billable: true`, the resolution algorithm checks entitlement BEFORE applying tenant overrides.

1. Is the flag or config billable? If no, skip to cascade.
2. If billable, does the resolved tenant have an active entitlement for this feature? If no, the flag resolves to its unentitled default regardless of any overrides. No config override can bypass a missing entitlement.
3. If entitled, proceed to tenant hierarchy cascade.

This means an enterprise paying for a feature can use it. An enterprise not paying for it gets the feature disabled, and no override can turn it on. Modules and individual features within modules can be independently entitled — tenants do not have to purchase every feature in a module.

### Per-key allowed scopes

Every config key and feature flag declares which tenant levels can override it via `allowedScopes`.

1. A billing module flag might allow only `platform` and `enterprise`, meaning only platform operators or enterprise admins can toggle it.
2. A UI preference config might allow all four levels down to `individual`.
3. If a scope is not in `allowedScopes`, the cascade skips it.

### White-labeling example

White labeling is the canonical example of a billable, tenant-scoped config family that still requires separate public and admin projections.

1. `tenant-branding.enabled`, `tenant-branding.customDomain`, and `tenant-branding.brandedEmails` must pass entitlement checks before tenant overrides can apply.
2. Most branding keys allow `platform`, `enterprise`, and `organization` overrides, with no `individual` override by default.
3. Public-safe fields such as company name, approved theme tokens, or published logo references may appear in public projections, but domain verification state, reply-to approval metadata, DNS proofs, and unpublished asset references remain admin-only or secret.
4. Without entitlement, the platform brand remains effective even if narrower-scope branding overrides exist in storage.
5. Dynamic custom-domain verification state is not itself a config key. It remains in module-owned PostgreSQL records even when the requested hostname is configured through the cascade.

### Cascade algorithm

1. Identify the module owning the key from its namespace prefix.
2. If the key is billable, check entitlement for the resolved tenant. If not entitled, return the unentitled default and stop.
3. If entitled or not billable, walk tenant scopes from narrowest to broadest, skipping scopes not in `allowedScopes`:
   a. Individual override — use if present.
   b. Organization override — use if present.
   c. Enterprise override — use if present.
   d. Platform override — use if present.
4. If no override found at any level, use the code-declared default.

### Standalone individual

An individual not in any organization or enterprise skips organization and enterprise levels. Their effective value comes from individual override, then platform override, then code-declared default. Entitlement is checked against the individual's own billing state.

### Override storage

PostgreSQL rows keyed by `(moduleId, key, scope, scopeId)` where `scopeId` is the enterprise ID, organization ID, or user ID depending on scope.

## Runtime Governance

1. Code declares config schemas, defaults, ownership, and allowed shapes in manifests or shared registries that stay versioned in the codebase for reviewability and agent-friendly edits.
2. PostgreSQL stores effective runtime values, overrides, history, approvals, and sync or drift information.
3. Effective runtime config and feature-flag changes must not require application redeploy when the declared schema already exists.
4. The admin app shows declared defaults, persisted overrides, effective config, effective permissions, effective feature state, sync drift, entitlement status, and the approval source for the current state.

## Sync Rules

1. Shared sync or reconciliation flows must support bidirectional synchronization between code-declared config and PostgreSQL-backed records.
2. Code-to-database sync must create, update, retire, or reconcile the required runtime records from committed code declarations.
3. Database-to-code sync must surface runtime changes approved by users with the proper permissions as reviewable code updates or agent-consumable change proposals instead of silently mutating the codebase.
4. Removed or renamed config keys must go through explicit retirement or migration handling; they are not silently dropped from the database.
5. Drift between code declarations and database state must be detectable, reviewable, and auditable in both directions.

## No-Guessing Rule

The platform must answer these questions without code search:

1. What feature is enabled?
2. Which permission makes this action possible?
3. Which projection profile exposes this field?
4. Which config value is effective?
5. Who changed it and why?
6. Is this value aligned with the code-declared registry or in drift?
7. Can this runtime state be synchronized back to the codebase, and what review artifact represents that change?
8. Was this state approved by committed code or by an authorized runtime operator?
9. Is the feature billable and is the tenant entitled?
10. At which scope level was the effective value set?

## Approval Rules

1. Code-side approval for schema, defaults, ownership, and retirement changes is the committed code change that enters the repository.
2. Database-side runtime config and feature changes require an authenticated user with the proper permission scope.
3. High-risk changes require additional approval workflows.
4. Sensitive permission changes require audit trail and actor identity.
5. Breaking schema changes require ADRs and migration plans.
