# 011 Backup, Recovery, and Resilience

Status: accepted

## Required Outcomes

1. Backup plans for Convex data, PostgreSQL data, and critical service configuration.
2. Restore verification procedures.
3. Runbooks for degraded dependencies.
4. Clear definition of what data is authoritative during recovery.

## Resilience Rules

1. Temporary dependency failure must fail safely.
2. Security controls remain enforced during degraded operation.
3. Recovery procedures must preserve audit and compliance integrity.
