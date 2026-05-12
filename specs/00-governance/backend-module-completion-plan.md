# Backend 100% Module Completion Plan

Status: refreshed working plan

Last updated: 2026-05-11

## Objective

Treat this as one continuous governance-first backend completion session, not a code-only sprint. This plan is refreshed against the repository state captured in [implementation-tracker.md](implementation-tracker.md) on 2026-05-11, including the landed observability and deployment-validator closeout work, and describes the remaining path from the current codebase rather than the original from-scratch sequence.

[implementation-tracker.md](implementation-tracker.md) remains the source of truth for module status. This plan exists to summarize the current state, order the remaining backend work by blocker and dependency, and define the evidence required before any tracker row moves to `validated`.

## Backend-Only Completion Bar

Backend completion in this plan means all 19 modules and the blocking cross-cutting platform rows are `validated` through shared services, backend-owned HTTP routes, durable state, operator-safe CLI or runbook-backed workflows that execute typed backend paths rather than direct storage edits, smoke validation, and green repository gates.

New admin, public-web, or product-app UI expansion is out of scope for this plan. Existing thin first-party route boundaries may remain as consumers of shared backend services, but new frontend feature work is not part of the backend completion bar and must not block honest backend `validated` status.

## Ground Rules

- Scope includes all 19 tracker modules plus the cross-cutting platform rows that block honest `validated` status.
- Completion bar is `validated` for every module, not merely `implemented`.
- Frontend UI expansion stays out of scope. Backend-owned services, HTTP routes, typed tooling, smoke coverage, and runbooks that drive those typed backend paths are the delivery bar for this plan.
- If a slice changes architecture, ownership, permissions, security, or operator workflow, update the governing spec, manifest, tracker row, and any required ADR before implementation.
- Keep the canonical module order below for traceability, but execute the remaining work in live blocker order rather than historical module order.
- Do not let this plan drift away from the tracker. Refresh the plan whenever tracker status, evidence, or next-gap text changes materially.
- Every review-worthy slice ends with a distinct SaaS Foundation Steward pass before a final status move.

## Current State Snapshot

### Validated modules

- Authorization
- Field security
- Audit log
- Feature flags
- Identity session
- Runtime config
- Workflow jobs
- Tenant management
- Notification center
- Email delivery
- Billing and metering
- Search
- Import export
- Observability
- Webhooks API access
- Retention legal hold
- Support operations
- File storage
- Tenant branding

### Implemented modules

- None currently.

### Scaffolded modules

- None currently.

### Cross-cutting gaps still blocking honest backend completion

- None currently. The last completion-critical blockers closed once the live backend-ready smoke harness passed in this workspace against the refreshed OpenPanel client credentials and the pushed self-hosted Convex deployment.
- Remaining work from here is post-completion expansion and stewardship hygiene, not unfinished backend-completion-plan scope.

### Explicit non-blockers for this plan

- Expanding the admin app beyond the existing tenant repair console.
- Broadening public-web or product-app UI beyond thin route or server-function boundaries.
- Landing browser-mode feature work before the backend service, HTTP, and smoke-completion bar is met.
- The current live operator follow-up is environmental, not architectural: the started-container validator now reports when the running local stack is missing required services or bootstrap preconditions.

### Current validation baseline

- Repository validation target for validated work remains `bun run format:check`, `bun run typecheck`, and `bun run test`.
- The latest closeout validation in this session keeps `bun run format:check`, `bun run typecheck`, `bun run test`, and `bun run ops:docker:validate-local -- --env-file .env.example` green.
- Live started-container validation is now wired through `bun run ops:docker:validate-local -- --env-file .env.example --started-containers` and reports real local-stack drift instead of the earlier `postgres-bootstrap` false negative.
- `bun run backend:subscriber-journey:ready` is now green in this workspace after refreshing the live OpenPanel client secret, rotating the current Convex admin key, and pushing the current Convex workflow functions to the active self-hosted deployment.

## Completed Foundation Context

This work is already done and should stay treated as reusable foundation rather than active backlog:

1. Access-control substrate is validated through Authorization and Field security.
2. Operator-trusted governance substrate is validated through Audit log, Feature flags, Identity session, Runtime config, Retention legal hold, and Support operations.
3. Managed file lifecycle is validated through File storage.
4. Reusable operator or domain slices now include validated Billing and metering, Workflow jobs, Tenant management, Notification center, Tenant branding, Email delivery, Search, Import export, Observability, and Webhooks API access.

The remaining plan starts from that baseline instead of reopening it.

## Remaining Phase Plan

### Completed Foundation

Use the current validated baseline as the template set for the remaining work. Do not reopen completed foundation phases unless the tracker or the steward pass identifies a real regression.

### Phase 0: Definition Of Done Reset

1. Keep [implementation-tracker.md](implementation-tracker.md) as the live maturity source of truth while rewriting backend completion around shared services, backend-owned HTTP routes, tooling, smoke evidence, and runbooks.
2. Remove UI-only work from backend blocker language so new admin screens and other frontend expansion remain visible as follow-on application work instead of backend gates.
3. Preserve the two-layer transport rule: first-party app helpers stay thin consumers of shared services, while backend-owned H3 handlers remain the external caller boundary.

Dependency notes:

- This phase is documentation and governance alignment, not a feature slice.
- Later module work must not reintroduce UI-only evidence as a backend completion requirement.

### Phase 1: Shared Backend Execution Baseline

1. Completed: move the remaining caller-supplied session-id transport flows into the H3 [request-middleware.ts](../../packages/platform/src/http/request-middleware.ts) boundary so backend-owned HTTP transport uses one trusted session-routing path instead of mixed payload and header extraction.
2. Completed: add backend-owned platform health and readiness routes so smoke tooling and operators can validate adapter and service availability without using app shells.
3. Completed: broaden the existing subscriber-journey readiness and live-smoke tooling into a backend completion smoke harness that covers governance, support, retention, billing, file-storage, search, and webhook flows.
4. Completed: add environment-specific deployment validation for the local stack and concern-owned service groups so the Compose baseline becomes executable evidence rather than a documentation-only scaffold through `bun run ops:docker:validate-local`, including duplicate published-port detection and rendered service-inventory checks for the analytics and security groups.

Dependency notes:

- This phase establishes the trust boundary and validation path for every later phase.
- Runtime config stays the template in this phase, not the unfinished target.
- Phase 1 is now complete: the request-boundary hardening, backend readiness routes, backend completion smoke harness, and local deployment validation are all landed in code.

### Phase 2: Revenue And Backend-Ready Subscriber Journey

1. Post-completion expansion: broaden Billing and metering into quota enforcement, usage decisions, renewals, cancellations, failed-payment recovery, and durable customer-account convergence.
2. Post-completion expansion: keep inbound webhook verification, replay, operator repair, and billing explanation anchored in the existing Webhooks API access, Subscriber journey, and Admin billing service surfaces.
3. Completed: the backend-ready subscriber journey from [backend-readiness-roadmap.md](backend-readiness-roadmap.md) remains the accepted smoke-validation baseline, and current workspace execution of `bun run backend:subscriber-journey:ready` is now green after refreshing the live environment and pushing the current Convex workflow runtime.
4. Treat thin public-web and product-app boundaries as optional consumers of the shared backend path rather than part of the delivery bar for this plan.

Dependency notes:

- This phase closes the current strongest backend vertical slice into the accepted backend-ready milestone.
- The backend-ready subscriber journey milestone remains green in repository history and is now green again in the current workspace through the shared H3 transport, trusted-session middleware, and live smoke harness.
- Durable payment-event invoice history, admin billing explanation, OpenAPI coverage, and backend live-smoke inspection are now landed on the Phase 2 operator surface.
- Tenant and communication follow-up work stay behind this phase unless a specific slice becomes a hard dependency of the milestone.
- The smoke harness added in Phase 1 becomes the required validation layer for this phase.

### Phase 3: Workflow Generalization And Operator Maturity

1. Workflow jobs now provides the validated shared operator control plane for durable scheduling, inspection, replay, cancellation, and actor-preserving execution across the current Billing, Search, and Import export consumers.
2. Keep Tenant management on the now-validated onboarding review, membership inspection, direct membership mutation, durable invitation issue, inspect, and revoke, and authenticated invitation token handoff plus redemption baseline rather than reopening that slice during workflow generalization.
3. Post-completion expansion: add the remaining governance-side operator flows, including authorization tuple revocation and broader projected review workflows over the existing trusted-session mutation path.

Dependency notes:

- This phase starts with the workflow-job generalization intentionally deferred behind the lead backend-ready milestone.
- The shared workflow substrate from this phase already has validated Billing, Search, and Import export consumers on the shared operator surface and remains the reuse target for later work.

### Phase 4: Communication Completion

1. Keep downstream branding publication and other managed-file consumers on the validated File storage lifecycle instead of parallel storage paths.
2. Keep newly completed identity/session, auth-start, hosted-checkout, invitation-redemption, email, and notification branding handoffs on the validated stored projection path instead of reintroducing per-surface branding resolution.
3. Post-completion expansion: extend Notification center from its validated email, digest, and in-app foundation into additional non-email channel orchestration.

Dependency notes:

- Tenant branding has now crossed the validated bar with stored projection handoff across app snapshots, tenant-invitation redemption, tenant-hinted public auth-start, backend-owned auth-start transport, hosted checkout, branded email sender identity, notification dispatch, support-safe operator views, custom-domain lifecycle mutation, and managed asset publication on the shared backend surface.
- Email delivery now carries a validated durable tracking and suppression baseline, verified Postal provider intake, the versioned invitation template registry, and the first notification-center-backed `billing.invoice-ready` typed template consumer on the shared branded sender path.
- Notification center has now crossed the validated bar with accepted receipt-inspection, email-preference, digest-scheduling, and in-app-state specs, shared contracts, generated migrations, a PostgreSQL-backed email receipt ledger for queued, queue-failed, and suppressed orchestration outcomes, exact tenant-aware recipient and template preference overrides, billing-invoice-ready receipt persistence over the shared email-delivery and Novu path, digest-candidate and digest-run orchestration over shared workflow-jobs and Convex scheduling, actor-targeted in-app notification state over a Convex-backed store, and session-bound backend inspection and preference-management routes; the remaining phase work is extending notification-center into non-email channels and broader event families.

### Phase 5: Data And Compliance Closure

1. Post-completion expansion: broaden Search beyond tenant-index lifecycle, managed-file summary sync, operator preview query, the now-landed current-tenant managed-file query, the now-landed stored-settings reindex request, the now-landed managed-file synonym settings slice, and the now-landed background tenant-index ensure workflow plus operator request transport into additional document families and broader relevance management.
2. Post-completion expansion: broaden Import export from the now-landed managed-file-summary JSON and CSV export slices into additional import and export pipelines over shared Workflow jobs, Audit log, Retention legal hold, and File storage boundaries.
3. Post-completion expansion: extend Retention legal hold decisions into export and future destructive workflows beyond the already validated managed-file deletion path.
4. Post-completion expansion: keep downstream managed-file consumers on the validated File storage boundary.

Dependency notes:

- Search now carries a validated tenant-index lifecycle foundation with managed-file summary resync into tenant ensure, support-case preview query transport, current-tenant managed-file query transport, stored-settings reindex request transport, optional managed-file synonym settings, workflow-job reuse through tenant-index ensure dispatch, OpenPanel-backed business-event emission, and Search repair-gap replay over the shared workflow-jobs owner surface; future phase work is broader document-family coverage and broader relevance controls.
- Import export now carries a validated managed-file-summary JSON and CSV export foundation plus support-case-summary JSON export with shared workflow dispatch, execution, and replay, a module-owned PostgreSQL job record, backend-owned HTTP transport, generated OpenAPI coverage, generated migration coverage, and shared OpenPanel-backed business-event emission; future phase work is broader import or export families plus retention-guard enforcement.

### Phase 6: Observability, Deployment, And Closeout

1. Completed: finish the observability closeout after the implemented request-boundary OTLP trace emission, live smoke verification, GlitchTip uncaught-error wiring, aggregated readiness diagnostics, and provider-aware adapter health probes by adding OpenPanel-backed business-event emission where required.
2. Completed: close the deployment-baseline gap by adding non-interactive started-container health assertions for the full local stack on top of the repo-owned Compose validation path, including one-shot `postgres-bootstrap` handling.
3. Completed: update tracker evidence, manifests, specs, runbooks, deployment-baseline notes, technology-catalog references, and integration-test evidence required by the completed slices.
4. Completed: refresh the active self-hosted Convex deployment, rerun the backend-ready smoke harness, and promote Convex identity-backed execution plus the backend-owned HTTP API layer with current live evidence.

Dependency notes:

- Observability now has a validated shared emitter and readiness foundation; future event families should stay on that same shared path.
- Final closeout depends on the tracker, manifests, specs, and runbooks matching the actual repository validation state.

## Canonical Module Order And Current Status

1. Authorization — `validated`
2. Field security — `validated`
3. Audit log — `validated`
4. Identity session — `validated`
5. Support operations — `validated`
6. Feature flags — `validated`
7. Runtime config — `validated`
8. Workflow jobs — `validated`
9. Tenant management — `validated`
10. Tenant branding — `validated`
11. Email delivery — `validated`
12. Notification center — `validated`
13. Webhooks API access — `validated`
14. Retention legal hold — `validated`
15. File storage — `validated`
16. Search — `validated`
17. Import export — `validated`
18. Billing and metering — `validated`
19. Observability — `validated`

## Completion Closeout

1. Backend completion is now closed in the current workspace: the external Convex runtime was refreshed, the current workflow functions were pushed to the active self-hosted deployment, and the backend-ready smoke harness is green again.
2. The final cross-cutting platform rows, Convex identity-backed execution and the backend-owned HTTP API layer, now have current live evidence and are promoted to `validated`.
3. Remaining work beyond this point is post-completion expansion plus ongoing tracker and stewardship hygiene, not unfinished backend-completion-plan scope.

Execution notes:

- Billing and metering, Workflow jobs, Tenant management, Email delivery, Search, Import export, and Observability are now validated after the repo-wide gates turned green and the closeout evidence was reconciled.
- Support operations has now crossed the validated bar with active impersonation inventory, revocation, durable support-case metadata, and tenant-health aggregation over support-safe billing repair-gap summaries on the shared service, backend-owned HTTP, and OpenAPI surfaces.
- Webhooks API access has now crossed the validated bar with durable outbound subscription and API-key control, PostgreSQL-backed outbound delivery logs, workflow-jobs-backed retry or backoff orchestration, authenticated Convex dispatch and execution wiring, backend-owned request-delivery transport, generated OpenAPI coverage, a generated migration, and green repository validation.
- Tenant branding has now crossed the validated bar with durable custom-domain request, support-safe view, lifecycle mutation, asset publication, tenant-invitation redemption branding handoff, tenant-hinted public auth-start, backend-owned auth-start transport, hosted-checkout display-name and theme handoff, branded email sender identity, notification-center email dispatch, shared backend HTTP transport, OpenAPI coverage, focused validation, and green repository validation. Asset publication currently treats its post-commit audit append as best-effort across the durable runtime-config and audit boundary.
- Notification center has now crossed into validated with accepted receipt-inspection, email-preference, digest-scheduling, and in-app-state specs, shared contracts, PostgreSQL-backed email receipt plus exact email-preference, digest-candidate, and digest-run state, generated migrations, billing-invoice-ready receipt persistence plus suppression over the shared email-delivery and Novu boundary, shared workflow-jobs and Convex-backed digest scheduling or execution, actor-targeted in-app state over the Convex-backed store, session-backed admin inspection and preference-management transport, OpenAPI registration, focused persistence or service or HTTP or backend API validation, and a green repo-wide gate; the remaining gap is broader non-email channel orchestration and additional event families over that durable receipt, preference, digest, and in-app model.
- Retention legal hold and File storage stay active dependencies and reuse targets even though they are already validated.
- Runtime config is now validated, and no completion-critical platform rows remain outside post-completion expansion work.

## Cross-Cutting Execution Track

1. Keep the H3 request boundary as the single trusted session-routing and webhook pre-verification path for backend-owned HTTP execution.
2. Grow backend operator reachability through shared services, OpenAPI-documented HTTP handlers, CLI tooling, smoke coverage, and runbooks rather than new admin UI.
3. Keep the first-party app helper path and the backend-owned HTTP path calling the same shared business logic so no reusable workflow or policy logic drifts into either transport shell.

## Module Exit Checklist

- [ ] Governing spec, manifest, tracker row, and any required ADR updates exist before code when the slice changes architecture, ownership, security, permissions, or operator workflow.
- [ ] Shared constants, manifest helpers, field vocabularies, config keys, feature flags, and projection descriptors are updated with no raw-string drift.
- [ ] The module service, persistence boundary, and typed errors follow the existing Effect and Schema patterns already used by Runtime config, Admin governance, Admin billing, and Webhooks API access.
- [ ] First-party helpers and backend-owned HTTP handlers both call the same shared service boundary; no workflow or policy logic is duplicated across transport layers.
- [ ] Authorization, tenant isolation, field security, break-glass expiry, and audit behavior are enforced in backend layers, not in UI code.
- [ ] Required operator workflows are reachable through backend-owned HTTP routes, typed CLI tooling, or runbook-backed procedures that call the same backend-owned paths without relying on new frontend UI or direct storage edits.
- [ ] Targeted tests for the touched module or transport slice pass before widening scope.
- [ ] `bun run format:check`, `bun run typecheck`, and `bun run test` pass before any tracker row moves to `validated`.
- [ ] `bun run check:typecheck-coverage` passes whenever new TypeScript surfaces are added or typecheck coverage wiring could drift.
- [ ] Tracker evidence links, status text, and supporting docs are current before promoting a row to `validated`.
- [ ] The completed slice receives a distinct SaaS Foundation Steward pass before the final status move.

## Validation Cadence

- [ ] Start and end every module slice with the narrowest targeted tests available for the touched module or transport boundary.
- [ ] Before any tracker row moves to `validated`, run `bun run format:check`, `bun run typecheck`, and `bun run test`.
- [ ] Run `bun run check:typecheck-coverage` whenever the slice adds or moves TypeScript surfaces that could fall outside the current validation graph.
- [ ] Run `bun run ops:docker:validate-local` whenever a slice changes the local Compose baseline, published host ports, or the concern-owned analytics or security service groups.
- [ ] Use `bun run backend:subscriber-journey:ready` and `bun run backend:subscriber-journey:live-smoke` as the current backend completion smoke harness for readiness, governance, support, retention, billing, file-storage, search, webhook, and subscriber-journey coverage, then broaden that harness as later backend phases land.
- [ ] Keep phase-end smoke coverage focused on the backend-owned HTTP routes, webhook replay paths, operator mutation paths, and concern-owned services touched in that phase.
- [ ] Treat branch-name, commit-history, PR-body, compose-validation, `bun audit`, and Trivy workflows as merge gates rather than substitutes for module-scoped smoke validation.
- [ ] The local pre-push hook already reruns `bun run format:check`, `bun run typecheck`, and `bun run test`; module exit still requires explicit evidence and tracker alignment, not just hook success.
- [ ] End the session only after the tracker, manifests, specs, ADRs, runbooks, repository validation, smoke coverage, and stewardship review all match the green repository state.

## Template References

- [runtime-config.ts](../../packages/modules/src/governance/runtime-config.ts) - validated Effect plus PostgreSQL governance template.
- [admin-governance.ts](../../packages/platform/src/services/governance/admin-governance.ts) - operator workflow and projected-envelope service template.
- [admin-governance-http.ts](../../packages/platform/src/services/governance/admin-governance-http.ts) - backend-owned governance transport template.
- [admin-billing.ts](../../packages/platform/src/services/domains/admin-billing.ts) - adapter-to-module-to-operator-service vertical slice template.
- [admin-billing-http.ts](../../packages/platform/src/services/domains/admin-billing-http.ts) - operator HTTP transport template.
- [webhooks-api-access.ts](../../packages/platform/src/services/communication/webhooks-api-access.ts) - shared communication service template for inbound and outbound webhook control.
- [file-storage.ts](../../packages/modules/src/domains/file-storage.ts) - validated managed-file lifecycle and audit template.
- [request-middleware.ts](../../packages/platform/src/http/request-middleware.ts) - cross-cutting request-context, auth, and telemetry boundary.
- [access.test.ts](../../tests/modules/access.test.ts) - access and field-security regression template.
- [governance.test.ts](../../tests/modules/governance.test.ts) - governance, audit, and support-operations regression template.
- [admin-billing-http.test.ts](../../tests/platform/admin-billing-http.test.ts) - operator HTTP handler regression template.

## High-Risk Remaining Modules And Boundaries

1. Notification center still needs broader non-email-channel breadth and additional event families without bypassing the validated email-delivery tracking, suppression, digest, in-app, and tenant-branding-aware sender paths.
2. Search and Import export are now validated foundations, but future document-family and import/export-family growth still needs to stay on the current shared workflow, file-storage, and field-security paths.
3. Observability is now validated, and future backend-owned business events must stay on the shared emitter and readiness path rather than reintroducing per-module seams.
