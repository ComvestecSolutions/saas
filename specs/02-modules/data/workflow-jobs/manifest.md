# Workflow Jobs Manifest

Status: accepted

## Technology Boundary

Convex-native scheduling and actions for background job orchestration and scheduled workflows. The default foundation runs jobs on the existing Convex deployment and keeps the module boundary ready for a future external job-runner adapter if heavier orchestration is needed.

## Responsibilities

1. Background job registration, scheduling, and execution.
2. Retry, backoff, and dead-letter handling.
3. Job progress tracking and observability.
4. Scheduled and targeted recovery-based workflow execution.
5. Durable reconciliation deadlines and targeted follow-up recovery checks for cross-module repair workflows.
6. Operator-visible unresolved repair-gap inspection for scheduled retry, stale-running, and blocked workflow runs.

## Permission Scopes

| Scope             | Description                                     |
| ----------------- | ----------------------------------------------- |
| `workflow:manage` | Register, trigger, pause, and inspect workflows |

## Feature Flags

| Flag                    | Purpose           | Billable | Default | Allowed Scopes |
| ----------------------- | ----------------- | -------- | ------- | -------------- |
| `workflow-jobs.enabled` | Module visibility | No       | false   | platform       |

## Config Keys

| Key                                              | Description                                                                                                                      | Default | Billable | Allowed Scopes |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- | -------------- |
| `workflow-jobs.retry.maxAttempts`                | Whole-number post-primary automatic recovery budget before an unresolved reconciliation job is blocked for operator intervention | 3       | No       | platform       |
| `workflow-jobs.reconciliation.deadlineSeconds`   | Delay before a scheduled reconciliation deadline evaluates drift                                                                 | 300     | No       | platform       |
| `workflow-jobs.reconciliation.sweepIntervalMins` | Minutes between targeted follow-up attempts and stale-running reclaim checks for unresolved reconciliation jobs                  | 15      | No       | platform       |
| `workflow-jobs.claim.timeoutSeconds`             | Seconds before a stale-running reconciliation job is reclaimed for recovery handling                                             | 900     | No       | platform       |

## Data Classifications

| Data                      | Classification      |
| ------------------------- | ------------------- |
| Job payloads              | tenant-confidential |
| Job execution logs        | internal            |
| Scheduled job definitions | internal            |
| Unresolved gap reasons    | internal            |

## Projection Profiles

| Profile | Visible Fields                                                                                      | Audited Fields |
| ------- | --------------------------------------------------------------------------------------------------- | -------------- |
| admin   | jobId, tenantScope, tenantScopeId, status, attempts, scheduledAt, completedAt, gapReason, lastError | lastError      |
| summary | jobId, status, gapReason                                                                            | —              |

## Rules

1. Jobs must run within tenant context — no cross-tenant data access.
2. Scheduled retry, stale-running, and blocked repair-gap jobs must be inspectable in the admin app.
3. Job payloads containing sensitive data must be classified and redacted in logs.
4. Convex scheduling is orchestration only; durable reconciliation evidence and operator-visible unresolved repair-gap state must be persisted in PostgreSQL.
5. Reconciliation deadline and targeted recovery jobs must reuse the owning module's repair path instead of reimplementing domain recovery logic inside the scheduler.
