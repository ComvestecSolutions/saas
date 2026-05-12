# Config Rollback Runbook

Status: accepted

## Scope

Use this runbook when a runtime config value or runtime-config-backed feature rollout must be reversed safely through the current admin-governance HTTP control plane.

This runbook does not cover generic permission-override workflows or other future admin-governance approval surfaces that are not yet exposed by the current runtime-config endpoints.

The current operator endpoints are:

- `POST /api/admin/governance/runtime-config/overrides/list`
- `POST /api/admin/governance/runtime-config/proposals/list`
- `POST /api/admin/governance/runtime-config/override-proposals/submit`
- `POST /api/admin/governance/runtime-config/proposals/persist`
- `POST /api/admin/governance/runtime-config/proposals/review`
- `POST /api/admin/governance/audit-log/query-by-module`

Use `http://127.0.0.1:3010` as the default local origin when `bun run backend:subscriber-journey` is running. Replace that origin for deployed environments.

## Minimum Expectations

1. Capture the session id, target key, owning module, scope, scope id, last known good value, and rollback reason before changing anything.
1. Distinguish schema rollback from value rollback. If the key or schema no longer exists in code, the fix is a code change plus deploy, not a control-plane mutation.
1. Preserve audit evidence for the rollback itself.
1. Use proposal persistence for reviewable artifacts when the rollback exposes renamed or retired keys.

## Read Current State

1. The read responses are projected through the `runtime-config` governance view, but the request `moduleId` still needs to be the owning module for the target key.
1. The submit and review audit events are recorded under the owning module, not under the `runtime-config` view module.
1. List the current overrides.

```bash
curl -sS http://127.0.0.1:3010/api/admin/governance/runtime-config/overrides/list \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"sess_platform_operator","moduleId":"tenant-branding"}'
```

1. List pending or previously exported proposals.

```bash
curl -sS http://127.0.0.1:3010/api/admin/governance/runtime-config/proposals/list \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"sess_platform_operator","moduleId":"tenant-branding"}'
```

1. Record the target key, current value, `changedBy`, `changedAt`, and proposal status before rollback.

## Submit The Rollback

1. Submit a replacement value through the override-proposal endpoint. Example: roll back the tenant-branding company name at organization scope.

```bash
curl -sS http://127.0.0.1:3010/api/admin/governance/runtime-config/override-proposals/submit \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"sess_platform_operator","moduleId":"tenant-branding","key":"tenant-branding.companyName","scope":"organization","scopeId":"org_1","value":"Default Company Name","approvalReason":"Rollback after bad runtime override"}'
```

1. If the key supports the inherit sentinel, use `"inherit"` instead of a concrete value when the rollback should return to ancestor or code-default resolution.
1. Review the resulting proposal. Use the `proposal.proposalId` returned by the submit response. For the example above, that shape is `tenant-branding:tenant-branding.companyName:organization:org_1:override`.

```bash
curl -sS http://127.0.0.1:3010/api/admin/governance/runtime-config/proposals/review \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"sess_platform_operator","proposalId":"tenant-branding:tenant-branding.companyName:organization:org_1:override","status":"approved","decisionReason":"Approved rollback to last known good value"}'
```

1. Valid review statuses are `approved` and `rejected`.

## Persist Rename Or Retirement Artifacts

1. If the incident exposed a renamed or retired key, persist proposal artifacts so the code review can reconcile runtime state back into the spec and code surface.

```bash
curl -sS http://127.0.0.1:3010/api/admin/governance/runtime-config/proposals/persist \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"sess_platform_operator","moduleId":"tenant-branding","renameMap":{"tenant-branding.companyName":"tenant-branding.themePrimary"}}'
```

1. Review the generated proposal file under `specs/00-governance/runtime-config-proposals/` before merging any code-side cleanup.

## Verify

1. Re-run the override and proposal read endpoints.
1. Query the owning module audit stream for the rollback target. For the example above, use `tenant-branding`.

```bash
curl -sS http://127.0.0.1:3010/api/admin/governance/audit-log/query-by-module \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"sess_platform_operator","moduleId":"tenant-branding"}'
```

1. Confirm the audit stream reflects the expected control-plane actions: `runtime-config.override.proposed`, `runtime-config.override.changed`, and `runtime-config.proposal.reviewed`.
1. If the rollback still leaves drift between code and runtime state, open a follow-up code or spec change instead of editing PostgreSQL rows directly.

## Current Limitations

1. The rollback flow is API-first today; it is not yet a polished admin-app operator wizard.
1. Runtime-config mutations require a valid authenticated support-operator or platform-operator session.
1. Schema changes, deleted keys, and manifest ownership fixes still require code review and deployment even when the runtime value can be rolled back immediately.
