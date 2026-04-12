# Retention and Legal Hold Manifest

Status: accepted

## Technology Boundary

PostgreSQL via Drizzle for retention policies and legal hold records. Convex for file retention markers. Effect services for retention enforcement and purge scheduling.

## Responsibilities

1. Retention policy definition per data type and tenant.
2. Legal hold placement and release.
3. Purge scheduling and execution with audit trail.
4. Compliance evidence export.

## Permission Scopes

| Scope              | Description                               |
| ------------------ | ----------------------------------------- |
| `retention:manage` | Manage retention policies and legal holds |

## Feature Flags

| Flag                           | Purpose           | Billable | Default | Allowed Scopes |
| ------------------------------ | ----------------- | -------- | ------- | -------------- |
| `retention-legal-hold.enabled` | Module visibility | No       | false   | platform       |

## Config Keys

| Key                                         | Description                           | Default | Billable | Allowed Scopes       |
| ------------------------------------------- | ------------------------------------- | ------- | -------- | -------------------- |
| `retention-legal-hold.defaultRetentionDays` | Default data retention period in days | 730     | No       | platform, enterprise |

## Data Classifications

| Data                 | Classification      |
| -------------------- | ------------------- |
| Retention policies   | internal            |
| Legal hold records   | regulated-sensitive |
| Purge execution logs | regulated-sensitive |

## Projection Profiles

| Profile           | Visible Fields                                               | Audited Fields            |
| ----------------- | ------------------------------------------------------------ | ------------------------- |
| admin             | policyId, dataType, retentionDays, legalHoldActive           | legalHoldActive           |
| compliance-review | policyId, dataType, retentionDays, legalHoldActive, evidence | legalHoldActive, evidence |

## Rules

1. Data under legal hold must never be purged regardless of retention policy.
2. Legal hold placement and release must be auditable with actor identity.
3. Purge execution must produce compliance evidence records.
