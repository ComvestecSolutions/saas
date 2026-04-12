# Support Operations Manifest

Status: accepted

## Technology Boundary

Keycloak for impersonation session management. PostgreSQL for support case audit trails. Admin app as the primary support interface.

## Responsibilities

1. User impersonation with audit trail.
2. Support case context and metadata management.
3. Escalation workflows and permission elevation.
4. Tenant health dashboard for support agents.
5. Break-glass emergency access with approval, expiry, and post-incident review.

## Permission Scopes

| Scope                 | Description                                  |
| --------------------- | -------------------------------------------- |
| `support:impersonate` | Impersonate a user for debugging and support |

## Feature Flags

| Flag                                   | Purpose                             | Billable | Default | Allowed Scopes |
| -------------------------------------- | ----------------------------------- | -------- | ------- | -------------- |
| `support-operations.enabled`           | Module visibility                   | No       | true    | platform       |
| `support-operations.breakGlassEnabled` | Enable break-glass emergency access | No       | false   | platform       |

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

| Profile      | Visible Fields                                              | Audited Fields   |
| ------------ | ----------------------------------------------------------- | ---------------- |
| admin        | caseId, supportAgent, impersonatedUser, startedAt, duration | impersonatedUser |
| support-safe | caseId, status, startedAt                                   | —                |

## Rules

1. Impersonation sessions must be time-bounded and produce distinct audit events.
2. Support agents must see support-safe projections by default, not admin views.
3. Escalation to higher permissions requires an approval workflow.
4. Break-glass access requires explicit reason, approver, expiry, and post-incident review.
