# Config Rollback Runbook

Status: accepted

## Scope

Use this runbook when a runtime config, permission override, or feature rollout must be reversed safely.

## Steps

1. Identify the change, actor, approval artifact, target module, affected tenants, and whether the change originated from a committed code change or a database-side runtime mutation.
2. Compare the code-declared default or manifest state, the current persisted override state, the last known good effective state, and the relevant approval records.
3. Apply the approved rollback through the runtime config control plane; do not require redeploy unless the schema itself changed.
4. Run bidirectional config sync or reconciliation and confirm that drift is resolved or explicitly recorded in both runtime state and code review artifacts.
5. Verify resulting state, capture audit evidence, and open a follow-up spec or code change if the rollback exposed retired or renamed keys.
