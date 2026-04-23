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

   ```powershell
    bunx convex run --push --typecheck disable --codegen disable `
         workflowJobRunner:runDueBillingConvergenceJobsInternal "{}"
   ```

3. Inspect billing repair gaps through the backend operator surface and confirm
   there are no lingering stale-running or overdue legacy billing workflow jobs.
   Use `GET /api/admin/billing/repair-gaps?sessionId=<sessionId>` for
   inspection. When a targeted replay is required, call
   `POST /api/admin/billing/repair-gaps/replays` with the operator Keycloak
   bearer token in `Authorization` and the operator session id in the standard
   `x-comvestec-session-id` header. Do not send the replay session id in the
   request body or query string.

   ```powershell
   Invoke-RestMethod -Method Post `
     -Uri "http://localhost:3000/api/admin/billing/repair-gaps/replays" `
     -Headers @{
       Authorization = "Bearer $keycloakIdToken"
       "x-comvestec-session-id" = $sessionId
     } `
     -ContentType "application/json" `
     -Body '{"jobId":"workflow-jobs:billing-repair:org_gap"}'
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
