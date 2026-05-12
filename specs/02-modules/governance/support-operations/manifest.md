# Support Operations Manifest

Status: accepted

## Technology Boundary

Keycloak token exchange for impersonation session management. PostgreSQL for durable support-case metadata, break-glass incident records, and support-case audit evidence. Tenant-health views aggregate tenant-scoped support-case context with support-safe workflow repair-gap projections. Backend-owned support-operations HTTP surfaces are the current operator entrypoint; the admin app remains the intended primary support interface as broader operator UI ships.

## Responsibilities

1. User impersonation with audit trail.
2. Support case context and metadata management.
3. Break-glass incident metadata management with durable pending-review records.
4. Escalation workflows and permission elevation.
5. Tenant health dashboard for support agents.
6. Break-glass emergency access with approval, expiry, and post-incident review.

## Permission Scopes

| Scope                 | Description                                  |
| --------------------- | -------------------------------------------- |
| `support:impersonate` | Impersonate a user for debugging and support |

## Feature Flags

| Flag                                   | Purpose                             | Billable | Default | Allowed Scopes |
| -------------------------------------- | ----------------------------------- | -------- | ------- | -------------- |
| `support-operations.enabled`           | Module visibility                   | No       | true    | platform       |
| `support-operations.breakGlassEnabled` | Enable break-glass emergency access | No       | true    | platform       |

## Config Keys

| Key                                                   | Description                          | Default | Billable | Allowed Scopes |
| ----------------------------------------------------- | ------------------------------------ | ------- | -------- | -------------- |
| `support-operations.impersonation.maxDurationMinutes` | Maximum impersonation session length | 30      | No       | platform       |
| `support-operations.breakGlass.maxDurationMinutes`    | Maximum break-glass access duration  | 30      | No       | platform       |

## Data Classifications

| Data                          | Classification      |
| ----------------------------- | ------------------- |
| Impersonation session records | regulated-sensitive |
| Support case metadata         | internal            |
| Escalation records            | internal            |

## Projection Profiles

| Profile      | Visible Fields                                                                                                                                                          | Audited Fields   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| admin        | caseId, supportAgent, tenantScope, tenantScopeId, summary, impersonatedUser, startedAt, lastUpdatedAt, durationMinutes, status, priority, approvedBy, reason, expiresAt | impersonatedUser |
| support-safe | caseId, supportAgent, tenantScope, tenantScopeId, summary, status, priority, startedAt, lastUpdatedAt                                                                   | —                |

## Rules

1. Impersonation sessions must be time-bounded and produce distinct audit events.
2. Support agents must see support-safe projections by default, not admin views.
3. Escalation to higher permissions requires an approval workflow.
4. Break-glass access requires explicit reason, approver, expiry, and a durable incident record that enters pending-review status until post-incident review completes.
5. Post-incident review must transition the incident status and emit a distinct support-operations audit event against the case identifier.
6. Keycloak-backed impersonation must mint a real impersonated session and keep operator approval provenance explicit in request-context impersonation metadata and emitted audit events.
7. Tenant-health operator views must stay tenant-scoped and support-safe by default, surfacing unresolved repair-gap summaries without workflow `lastError` details.
