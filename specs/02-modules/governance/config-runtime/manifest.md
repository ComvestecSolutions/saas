# Config Runtime Manifest

Status: accepted

## Technology Boundary

PostgreSQL via Drizzle for override storage, history, and approval records. Convex is not used for runtime config state.

## Responsibilities

1. Code-declared runtime configuration schemas, defaults, and ownership metadata.
2. Database-backed effective value storage, override history, and approval records.
3. Bidirectional sync and reconciliation between code-declared registries and database-backed runtime state.
4. Drift detection, no-redeploy activation, and rollback support.
5. Proposal lifecycle tracking that preserves approval metadata until committed code catches up and the artifact becomes `applied`.
6. Tenant-scoped cascade resolution: individual, organization, enterprise, platform.
7. Entitlement-gated resolution for billable config keys.
8. Canonical override and effective-value resolution for config families such as `tenant-branding`.
9. Durable proposal and review workflow for direct runtime override mutations before they affect effective runtime state.

## Config Key Declarations

Every config key in this module must declare:

1. `key` — namespaced as `{moduleId}.{keyName}`.
2. `description` — human-readable purpose.
3. `schema` — JSON Schema or Effect Schema type reference.
4. `defaultValue` — code-declared default.
5. `billable` — whether this key requires an active entitlement.
6. `allowedScopes` — which tenant hierarchy levels can override this key.
7. `owner` — the team or module responsible.

## Override Storage Model

PostgreSQL rows keyed by `(moduleId, key, scope, scopeId)` where scope is one of `platform`, `enterprise`, `organization`, `individual` and scopeId is the corresponding tenant identifier.

## Cascade Resolution

1. Check entitlement if the key is billable. If not entitled, return the unentitled default.
2. Walk scopes narrowest to broadest, skipping scopes not in the key's `allowedScopes`: individual, organization, enterprise, platform.
3. First override found wins. If none, use code-declared default.
4. Standalone individuals skip organization and enterprise levels.

## Permission Scopes

| Scope          | Description                               |
| -------------- | ----------------------------------------- |
| `config:read`  | Read runtime config values and history    |
| `config:write` | Create or update runtime config overrides |
| `audit:read`   | Inspect config change audit trails        |

## Feature Flags

| Flag                              | Purpose                                  | Billable | Default | Allowed Scopes |
| --------------------------------- | ---------------------------------------- | -------- | ------- | -------------- |
| `runtime-config.enabled`          | Module visibility                        | No       | true    | platform       |
| `runtime-config.inlineDiffViewer` | Show inline diff in admin config screens | No       | false   | platform       |

## Data Classifications

| Data                                              | Classification      |
| ------------------------------------------------- | ------------------- |
| Module ids, key names, scopes, statuses           | internal            |
| Override, runtime, code value                     | regulated-sensitive |
| Approval and decision reasons plus actor identity | regulated-sensitive |
| Change and generation timestamps                  | internal            |
| Proposal artifact paths                           | internal            |

## Projection Profiles

- `admin`: visible fields are `moduleId`, `key`, `scope`, `scopeId`, `value`, `source`, `changedBy`, `changedAt`, `approvalReason`, `proposalId`, `action`, `artifactPath`, `runtimeValue`, `codeValue`, `status`, `generatedAt`, `decidedBy`, `decisionReason`, and `decidedAt`.
- `admin`: audited fields are `value`, `approvalReason`, `runtimeValue`, `codeValue`, `decidedBy`, and `decisionReason`.

## Rules

1. All config must have explicit owner and schema.
2. Effective config changes must not require redeploy when the declared schema already exists.
3. Runtime overrides must be queryable by tenant, module, and scope level.
4. Code-to-database sync promotes only committed code declarations into runtime state.
5. Sync must support both code-to-database reconciliation and database-to-code export or pull flows.
6. Database-to-code sync must produce reviewable code changes or agent-readable change sets rather than silently rewriting source files.
7. Database-side runtime changes require an authenticated user with the proper permission scope and audit context.
8. Sync must preserve history and mark drift or retired keys explicitly.
9. High-risk changes require approval pathways.
10. Entitlement must be checked before applying any override for billable keys.
11. Dynamic operational state such as custom-domain verification status is not a config key. It remains in module-owned PostgreSQL records even when requested hostnames are resolved through config.
12. Approved runtime changes exported back toward code must emit structured change proposal artifacts rather than directly rewriting repository files.
13. Approved sync artifacts must transition to `applied` once the code-declared baseline matches the approved runtime value, and that transition must preserve the original review metadata.
14. Direct runtime override mutations must be submitted as durable override proposals, remain non-effective while pending or rejected, and only upsert the effective override state after an authenticated operator review approves them.
