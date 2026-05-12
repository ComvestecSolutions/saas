# Feature Flags Manifest

Status: accepted

## Technology Boundary

Unleash for flag evaluation and rollout definitions. The platform adapter wraps Unleash and evaluates existing Unleash definitions against code-declared flag keys. Override storage uses the same PostgreSQL model as runtime config.

## Responsibilities

1. Flag registration with key, owner, purpose, default state, billable flag, allowed scopes, dependency keys, lifecycle state, and retirement plan.
2. Rollout-backed effective-state evaluation and provenance when Unleash definitions exist.
3. Dependency and retirement tracking.
4. Tenant-scoped flag evaluation using the same cascade algorithm as runtime config.
5. Entitlement-gated evaluation for billable flags.

## Flag Declarations

Every feature flag must declare:

1. `key` — namespaced as `{moduleId}.{flagName}`.
2. `description` — human-readable purpose.
3. `owner` — the team or module responsible.
4. `purpose` — why this flag exists.
5. `defaultEnabled` — code-declared default state.
6. `billable` — whether this flag requires an active entitlement.
7. `allowedScopes` — which tenant hierarchy levels can override this flag.
8. `dependencies` — other declared feature flags that must resolve enabled before this flag can resolve enabled.
9. `lifecycle` — one of `active`, `deprecated`, or `retired`.
10. `retirementPlan` — when and how this flag will be removed.

## Flag Evaluation Cascade

Flag evaluation uses the same cascade algorithm as config resolution:

1. Check entitlement if the flag is billable. The module-owned `*.enabled` gate is the exception: it may be activated by an explicit operator override and then makes the module itself effective so narrower billable config keys can still resolve effective values through that module gate without claiming billed entitlement. Narrower billable feature flags still stay disabled when no active entitlement exists.
2. Retired flags always resolve disabled, remain visible for audit and admin review, and reject new runtime override proposals.
3. Every dependency in `dependencies` must resolve enabled before the dependent flag can resolve enabled.
4. Walk scopes narrowest to broadest, skipping scopes not in `allowedScopes`: individual, organization, enterprise, platform. The first explicit runtime override found wins.
5. If no override applies and a rollout definition exists, evaluate the rollout and surface the evaluated scope level in admin projections when the matched rule provides honest scope provenance.
6. If no override applies and no rollout definition exists, fall back to the code-declared `defaultEnabled` state.

## Permission Scopes

| Scope        | Description                              |
| ------------ | ---------------------------------------- |
| `flag:read`  | Read flag state and rollout provenance   |
| `flag:write` | Submit and review feature-flag overrides |

## Feature Flags

| Flag                                 | Purpose                                                                                                                                                 | Billable | Default | Allowed Scopes |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | -------------- |
| `feature-flags.enabled`              | Module visibility                                                                                                                                       | No       | true    | platform       |
| `feature-flags.legacyRolloutCatalog` | Keep the retired rollout-catalog declaration visible for audit and admin review after local rollout inspection moved into admin-governance projections. | No       | false   | platform       |

## Data Classifications

| Data                            | Classification      |
| ------------------------------- | ------------------- |
| Flag definitions and schemas    | internal            |
| Effective flag state per tenant | tenant-confidential |
| Rollout percentages             | internal            |

## Projection Profiles

| Profile | Visible Fields                                                                                                                     | Audited Fields |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| admin   | key, description, owner, purpose, defaultEnabled, effectiveState, source, entitled, dependencies, lifecycle, retirementPlan, scope | effectiveState |
| summary | key, effectiveState, lifecycle                                                                                                     | —              |

## Rules

1. Every flag must have owner, purpose, and retirement plan.
2. No hidden flags.
3. Effective flag state must be visible in the admin app per scope level.
4. Effective flag changes must not require redeploy and must use the same sync and drift surfaces as runtime config.
5. Billable flags must check entitlement before evaluation unless the flag is the module-owned `*.enabled` boundary that operators use to grant the module itself.
6. Dependency lists must reference other declared feature flags; dependency cycles are invalid declarations.
7. Flag retirement must follow explicit deprecation, not silent removal.
