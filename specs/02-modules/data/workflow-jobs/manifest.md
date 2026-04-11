# Workflow Jobs Manifest

Status: accepted

## Technology Boundary

Convex-native scheduling and actions for background job orchestration and scheduled workflows. The default foundation runs jobs on the existing Convex deployment and keeps the module boundary ready for a future external job-runner adapter if heavier orchestration is needed.

## Responsibilities

1. Background job registration, scheduling, and execution.
2. Retry, backoff, and dead-letter handling.
3. Job progress tracking and observability.
4. Scheduled and cron-based workflow execution.

## Permission Scopes

| Scope             | Description                                     |
| ----------------- | ----------------------------------------------- |
| `workflow:manage` | Register, trigger, pause, and inspect workflows |

## Feature Flags

| Flag                    | Purpose           | Billable | Default | Allowed Scopes |
| ----------------------- | ----------------- | -------- | ------- | -------------- |
| `workflow-jobs.enabled` | Module visibility | No       | false   | platform       |

## Config Keys

| Key                               | Description                               | Default | Billable | Allowed Scopes |
| --------------------------------- | ----------------------------------------- | ------- | -------- | -------------- |
| `workflow-jobs.retry.maxAttempts` | Maximum retry attempts before dead-letter | 3       | No       | platform       |

## Data Classifications

| Data                      | Classification      |
| ------------------------- | ------------------- |
| Job payloads              | tenant-confidential |
| Job execution logs        | internal            |
| Scheduled job definitions | internal            |

## Projection Profiles

| Profile | Visible Fields                                    | Audited Fields |
| ------- | ------------------------------------------------- | -------------- |
| admin   | jobId, status, attempts, scheduledAt, completedAt | —              |
| summary | jobId, status                                     | —              |

## Rules

1. Jobs must run within tenant context — no cross-tenant data access.
2. Failed jobs must be inspectable in the admin app.
3. Job payloads containing sensitive data must be classified and redacted in logs.
