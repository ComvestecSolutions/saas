# Sensitive Access Review Runbook

Status: accepted

## Scope

Use this runbook to review break-glass use, sensitive-field reads, and other privileged access signals in the current platform.

Current implementation note:

1. Authorization is validated and the session-backed support-operations service now persists distinct break-glass and impersonation-start audit events, and dedicated break-glass incident listing and review controls are available through the backend-owned support-operations surface.
1. Field-security sensitive-read events and runtime-config governance events are the current reliable admin-governance review signals in this slice.
1. Keycloak-backed impersonation session issuance exists, but active-session inventory and revocation remain tracked next gaps in the implementation tracker.

## Minimum Expectations

1. Review field-security and runtime-config events together for the same time window, and add support-operations evidence only when the incident context suggests break-glass use.
1. Correlate `actorId`, `tenantScopeId`, `target`, `reason`, and `correlationId` before deciding access was acceptable.
1. Treat any missing reason, expired break-glass context, or unexplained sensitive read as an investigation trigger.
1. Preserve the resulting evidence in the incident or access-review record.

## Audit Queries

Use the current admin-governance audit endpoint. Replace the session id with a valid support-operator or platform-operator session.

```bash
curl -sS http://127.0.0.1:3010/api/admin/governance/audit-log/query-by-module \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"sess_support_operator","moduleId":"support-operations"}'
```

Rerun the same request for:

1. `field-security` to review `field-security.sensitive-read`
1. `runtime-config` when the review involves a recent policy or override change that affected privileged access
1. `support-operations` as supplementary evidence when the incident context suggests break-glass or impersonation use

## What To Look For

1. `field-security.sensitive-read` should map to a legitimate operator action and a recent justification. Secret fields should never appear in the response body because they are always redacted.
1. `runtime-config.override.proposed`, `runtime-config.override.changed`, and `runtime-config.proposal.reviewed` help explain whether a policy change created or resolved the privileged access window.
1. If present, `support-operations.break-glass.started` should have a named actor, a non-empty reason, and an expiry-backed break-glass context.
1. If present, `support-operations.impersonation.started` should map to an approved operator action, a clear reason, and a target actor or tenant that matches the reviewed incident.

## Interpretation

1. If a sensitive read exists without a clear operator reason, escalate immediately.
1. If a break-glass event is present and outlives its intended time window, treat it as a defect or control failure. Expired break-glass access is supposed to be denied.
1. If the access path depends on a newly changed config key or flag, capture the proposal and approval evidence before approving the review.
1. If the same `correlationId` spans field-security, runtime-config, and any supplementary support-operations events, keep those records together in the review packet.

## Current Limitations

1. The current review flow does not yet have a dedicated support-operations admin UI for listing or revoking impersonation sessions.
1. Break-glass review evidence is now available through dedicated support-operations incident listing and review endpoints, but impersonation inventory and revocation surfaces have not shipped yet.
1. The audit query endpoint is module-scoped, so a complete review may require multiple requests for the same incident window.
