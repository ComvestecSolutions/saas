# Feature Flags Manifest

Status: accepted

## Technology Boundary

Unleash for flag evaluation and rollout management. The platform adapter wraps Unleash and feeds it code-declared flag registrations. Override storage uses the same PostgreSQL model as runtime config.

## Responsibilities

1. Flag registration with key, owner, purpose, default state, billable flag, allowed scopes, and retirement plan.
2. Rollout policy including percentage rollout per scope level.
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
8. `retirementPlan` — when and how this flag will be removed.

## Flag Evaluation Cascade

Flag evaluation uses the same cascade algorithm as config resolution:

1. Check entitlement if the flag is billable. If not entitled, the flag is disabled regardless of overrides.
2. Walk scopes narrowest to broadest, skipping scopes not in `allowedScopes`: individual, organization, enterprise, platform.
3. First override found wins. If none, use `defaultEnabled`.
4. Percentage rollout applies within a scope level — for example, 10% of individuals in an organization.

## Permission Scopes

| Scope        | Description                               |
| ------------ | ----------------------------------------- |
| `flag:read`  | Read flag state and rollout configuration |
| `flag:write` | Create, update, or retire feature flags   |

## Feature Flags

| Flag                    | Purpose           | Billable | Default | Allowed Scopes |
| ----------------------- | ----------------- | -------- | ------- | -------------- |
| `feature-flags.enabled` | Module visibility | No       | true    | platform       |

## Data Classifications

| Data                            | Classification      |
| ------------------------------- | ------------------- |
| Flag definitions and schemas    | internal            |
| Effective flag state per tenant | tenant-confidential |
| Rollout percentages             | internal            |

## Projection Profiles

| Profile | Visible Fields                                                 | Audited Fields |
| ------- | -------------------------------------------------------------- | -------------- |
| admin   | key, description, owner, defaultEnabled, effectiveState, scope | effectiveState |
| summary | key, effectiveState                                            | —              |

## Rules

1. Every flag must have owner, purpose, rollout plan, and retirement plan.
2. No hidden flags.
3. Effective flag state must be visible in the admin app per scope level.
4. Effective flag changes must not require redeploy and must use the same sync and drift surfaces as runtime config.
5. Billable flags must check entitlement before evaluation.
6. Flag retirement must follow explicit deprecation, not silent removal.
