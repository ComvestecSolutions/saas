# Incident Response Runbook

Status: accepted

## Scope

Use this runbook for security incidents, availability incidents, data-integrity concerns, or operator mistakes that affect the current repo-managed platform footprint.

The current responder surface is:

- The repo-managed Docker Compose entrypoint at `ops/docker/compose.yml`
- The backend-owned API documentation at `http://127.0.0.1:3010/api/docs` and `http://127.0.0.1:3010/api/openapi.json` when `bun run backend:subscriber-journey` is running
- The admin governance audit endpoint at `POST /api/admin/governance/audit-log/query-by-module`
- The admin billing repair-gap and reconciliation endpoints under `/api/admin/billing/*` for billing-specific incidents

## Minimum Expectations

1. Assign an incident commander and capture the first known bad timestamp.
1. Preserve logs, traces, and audit evidence before destructive remediation.
1. Contain the active blast radius with the smallest current control that works.
1. Record manual gaps or unsupported operator actions instead of inventing an automation path during the incident.

## Initial Triage

Identify whether the failure is in first-party app routing, the backend-owned API, a shared infrastructure dependency, or a single tenant or organization scope.

Capture the current stack state before restarting anything.

```bash
docker compose --env-file .env -f ops/docker/compose.yml ps
```

If the backend-owned API is part of the incident, confirm the current contract from the live docs surface.

Use these current documentation URLs: Swagger UI at `http://127.0.0.1:3010/api/docs` and OpenAPI JSON at `http://127.0.0.1:3010/api/openapi.json`.

Record which services, routes, and tenant scopes are in the blast radius.

## Evidence Collection

1. Save recent Compose logs for the affected services.

```bash
docker compose --env-file .env -f ops/docker/compose.yml logs --since 30m postgres keycloak convex-backend ory-keto valkey grafana loki tempo glitchtip > incident-logs.txt
```

1. Export audit evidence for the relevant governance module. Example runtime-config query:

```bash
curl -sS http://127.0.0.1:3010/api/admin/governance/audit-log/query-by-module \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"sess_platform_operator","moduleId":"runtime-config"}'
```

1. For sensitive-access incidents, start with `moduleId` values `field-security` and `runtime-config`.
1. Query `support-operations` when the incident context suggests break-glass or impersonation use, and use the dedicated support-operations incident list and review endpoints when the response requires case-level break-glass follow-up.
1. For billing incidents, inspect the live docs for `GET /api/admin/billing/repair-gaps`, `POST /api/admin/billing/repair-gaps/cancellations`, `POST /api/admin/billing/repair-gaps/replays`, and `POST /api/admin/billing/reconciliation/runs` before changing any job state.

## Containment

1. If a bad runtime override or feature-flag change caused the incident, use [config-rollback.md](./config-rollback.md) instead of direct database edits.
1. If billing convergence is failing, prefer the existing repair-gap cancellation, replay, or manual reconciliation endpoints over ad hoc row updates.
1. If the edge or secrets dependency itself is compromised, isolate only the affected service group from the main entrypoint.

```bash
docker compose --env-file .env -f ops/docker/compose.yml stop kong vault
```

1. If break-glass or privileged access is suspected, preserve audit evidence first and use the dedicated support-operations incident list and review endpoints for case-level break-glass follow-up. The current platform still lacks a dedicated support-operations UI for reviewing every active escalation or revoking impersonation flows.

## Recovery

1. Restore the last known good runtime config, restart only the services that require it, and keep the rest of the stack stable.
1. If data recovery is required, use [backup-restore.md](./backup-restore.md) instead of re-seeding shared databases in place.
1. Re-run the failing operator or customer path from the current documented API or app surface.
1. Query the audit log again and confirm the recovery did not introduce new unexpected privileged events.

## Closeout

1. Record the timeline, affected services, impacted scopes, and exact operator actions taken.
1. File follow-up work for any missing automation, dashboards, or operator controls discovered during the incident.
1. Update the relevant spec, ADR, or runbook in the same change if the incident exposed documentation drift.

## Current Gaps

1. There is not yet a repo-owned one-command incident bundle that captures logs, traces, and audit evidence together.
1. Support-operations now resolves operator sessions, issues Keycloak-backed impersonation grants, and persists distinct break-glass and impersonation-start audit events, but dedicated escalation review and revocation controls remain a tracked next gap.
1. Some recovery steps still depend on manual operator judgment across Compose services rather than a single control plane.
