# Audit Log Manifest

Status: accepted

## Technology Boundary

PostgreSQL via Drizzle for immutable audit event storage, query, and retention. Events structured using `AuditEventSchema` from contracts.

## Responsibilities

1. Immutable audit event capture.
2. Query support for security, compliance, and operations.
3. Retention and export behavior.

## Mandatory Module Audit Declarations

Every module must declare at least:

1. mutation events that change configuration, permissions, or tenant-visible state
2. privileged read events when projection profiles mark audited fields
3. impersonation or break-glass events when the module supports privileged access
4. export, deletion, or retention events when the module manages regulated data

## Permission Scopes

| Scope        | Description                                    |
| ------------ | ---------------------------------------------- |
| `audit:read` | Inspect audit trails and sensitive-read events |

## Feature Flags

| Flag                | Purpose           | Billable | Default | Allowed Scopes |
| ------------------- | ----------------- | -------- | ------- | -------------- |
| `audit-log.enabled` | Module visibility | No       | true    | platform       |

## Config Keys

| Key                              | Description                            | Default | Billable | Allowed Scopes       |
| -------------------------------- | -------------------------------------- | ------- | -------- | -------------------- |
| `audit-log.retentionDays`        | Days before audit records are archived | 365     | No       | platform, enterprise |
| `audit-log.sensitiveReadCapture` | Capture sensitive field access events  | true    | No       | platform             |

## Data Classifications

| Data                              | Classification      |
| --------------------------------- | ------------------- |
| Event ids, timestamps, action     | internal            |
| Actor identity and tenant scopeId | regulated-sensitive |
| Targets and reasons               | regulated-sensitive |
| Correlation IDs and module ids    | internal            |

## Projection Profiles

- `admin`: visible fields are `eventId`, `timestamp`, `actorId`, `moduleId`, `tenantScope`, `tenantScopeId`, `action`, `target`, `reason`, and `correlationId`.
- `admin`: audited fields are `actorId`, `tenantScopeId`, `target`, and `reason`.

## Rules

1. Capture actor, target, reason where relevant, and correlation context.
2. Distinguish audit logs from general application logs.
3. Sensitive-read events must be searchable.
4. Audit declarations are part of module compatibility and may not be left implicit.
5. Implemented audit actions must use the shared module-scoped audit action constants from contracts instead of ad hoc string literals.
