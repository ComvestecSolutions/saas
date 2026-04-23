# ADR-019 Keycloak-Backed Convex Identity Execution

Status: accepted

## Decision

Use Keycloak as the trusted identity issuer for Convex-authenticated billing and workflow execution.

User or operator initiated Convex calls must present a Keycloak-backed identity token that Convex validates directly. Those tokens must carry the shared `comvestec_actor_type` claim so Convex can admit only `platform-operator` and `service-actor` principals at the billing workflow boundary. Automatic billing and workflow executions must run as an explicit service actor with auditable identity and correlation provenance instead of anonymous internal execution.

Backend-owned manual admin reconciliation triggers must bind the forwarded Keycloak bearer token back to the resolved operator session before calling Convex. The bearer token `sub` must match the session `actorId`, and the actor-type claim must remain `platform-operator`, before audit write or workflow execution proceeds.

PostgreSQL remains the system of record for workflow state, reconciliation state, onboarding state, and audit evidence. Convex remains an execution and scheduling boundary, not the durable source of truth for billing repair state.

## Rationale

1. The platform already treats Keycloak as the source for authentication and session lifecycle, so adding a second primary identity authority for Convex would split the trust boundary.
2. Convex-native authenticated execution allows function runs, logs, and transaction traces to expose the actor identity directly instead of relying only on app-local request correlation.
3. Billing reconciliation already depends on durable PostgreSQL state for customer linkage, onboarding repair, entitlements, and workflow status, so authenticated Convex execution should layer on top of that durable model rather than replace it.
4. Automatic billing repair runs still need identity. An explicit service-actor model is safer and more auditable than anonymous internal actions or implicit admin-key shortcuts.
5. A backend-owned admin reconciliation trigger is needed before frontend admin work ships so operators and smoke tooling can validate the slice end to end.

## Consequences

1. The Convex auth configuration must trust Keycloak issuer and audience settings that exactly match the tokens used for user or operator execution.
2. The Keycloak realm configuration must expose a service-account-capable client or equivalent trusted path for service-actor executions that Convex can validate, and it must project the shared actor-type claim into the ID token surface.
3. Billing reconciliation can no longer rely on broad authenticated-user admission at the Convex boundary. Claim-gated admission is required so only `platform-operator` and `service-actor` principals can schedule or execute workflow jobs.
4. Backend-owned admin reconciliation routes must reject bearer tokens that do not match the resolved session actor provenance before the request can create audit evidence or trigger Convex execution.
5. Convex-authenticated billing executions must emit correlation, actor, tenant, job, and trigger provenance into logs or function-run metadata while PostgreSQL continues to hold the durable workflow and reconciliation state.
6. Billing reconciliation completion rules need to stay strict: authenticated execution does not relax the requirement that onboarding, provisioning, subscription, entitlement, and webhook state all converge without duplicate durable records.
