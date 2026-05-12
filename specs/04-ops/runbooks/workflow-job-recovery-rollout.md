# Workflow Job Recovery Rollout

Use this runbook when deploying the billing workflow change that removes
the global `billing-convergence-recovery-sweep` cron and replaces it with
targeted per-job recovery scheduling.

## Why This Exists

Jobs created after the rollout schedule their own follow-up recovery attempts automatically.

Jobs that were already persisted before the rollout keep their existing
scheduled primary executor, but they do not receive the new targeted
follow-up recovery executors retroactively until they are rescheduled by
the new code path.

## One-Time Rollout Steps

1. Deploy the new workflow-jobs and Convex runtime code.
2. Run a one-time due-job sweep against the active Convex deployment:

   ```bash
   bunx convex run --push --typecheck disable --codegen disable \
     workflowJobRunner:runDueBillingConvergenceJobsInternal '{}'
   ```

3. Inspect billing repair gaps through the backend operator surface and confirm
   there are no lingering stale-running or overdue legacy billing workflow jobs.
   Use `GET /api/admin/billing/repair-gaps` with a platform-operator session id
   scoped to the platform tenant in the standard `x-comvestec-session-id`
   header. Add an `inspectionReason` query parameter only when the operator
   needs failure details in the response.
   Use `POST /api/admin/billing/inspections` with the same platform-operator
   session id when the operator needs the current projected billing summary or
   invoice history for a specific tenant. Keep the inspection reason in the
   JSON body, not in query parameters. When invoice history is requested, the
   reason is required so the field-security audit path can record the sensitive
   read.
   When a targeted replay is required, call
   `POST /api/admin/billing/repair-gaps/replays` with the operator Keycloak
   bearer token in `Authorization` and the operator session id in the same
   `x-comvestec-session-id` header. Do not send the session id in the request
   body or query string.

   ```bash
   curl -sS \
      -H "x-comvestec-session-id: ${SESSION_ID}" \
      "http://127.0.0.1:3010/api/admin/billing/repair-gaps?inspectionReason=Investigate%20tenant%20repair%20failures"
   ```

   ```bash
   curl -sS \
      -X POST \
      -H "x-comvestec-session-id: ${SESSION_ID}" \
      -H "Content-Type: application/json" \
      -d '{"tenant":{"scope":"organization","scopeId":"org_gap","organizationId":"org_gap"},"inspectionReason":"Investigate tenant billing history"}' \
      http://127.0.0.1:3010/api/admin/billing/inspections
   ```

   ```bash
   curl -sS \
      -X POST \
      -H "Authorization: Bearer ${KEYCLOAK_ID_TOKEN}" \
      -H "x-comvestec-session-id: ${SESSION_ID}" \
      -H "Content-Type: application/json" \
      -d '{"jobId":"workflow-jobs:billing-repair:org_gap"}' \
      http://127.0.0.1:3010/api/admin/billing/repair-gaps/replays
   ```

4. If any legacy billing workflow jobs were still scheduled in the future
   at deploy time, rerun the due-job sweep after the latest pre-rollout
   reconciliation deadline plus one reconciliation sweep interval so those
   jobs receive at least one reclaim pass under the new runtime.
5. Repeat the one-time due-job sweep if rollout-era legacy jobs remain in
   `scheduled` or `running` state without clearing.

## Expected Steady State

- New billing reconciliation jobs schedule their own targeted recovery
  attempts, including one exhausted-budget block observation and one spare
  follow-up, when they are created or rescheduled.
- Executor-less dispatch failures are blocked and operator-visible.
- Partial coverage is surfaced as an operator-visible scheduled repair gap.
- Stale-running jobs are blocked once the automatic recovery attempt budget is exhausted.
