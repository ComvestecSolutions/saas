# Current Platform Overview

Status: accepted

Last reviewed against the repository on 2026-05-11.

## What This Document Is

This is a plain-English explanation of the Comvestec SaaS Foundation as it exists today.

It is written for stakeholders, not only developers. It explains:

1. What this project is.
2. Why it exists.
3. What parts are working today.
4. Why the working parts were designed that way.
5. What is still not finished.
6. How the unfinished parts are expected to work when they are completed.

This document is based on the repository's own source-of-truth materials and current route or service code, especially:

- [../../README.md](../../README.md)
- [implementation-tracker.md](implementation-tracker.md)
- [backend-readiness-roadmap.md](backend-readiness-roadmap.md)
- [../02-apps/public-web/spec.md](../02-apps/public-web/spec.md)
- [../02-apps/product-app/spec.md](../02-apps/product-app/spec.md)
- [../02-apps/admin-app/spec.md](../02-apps/admin-app/spec.md)

## Executive Summary

This repository is not a finished single application. It is a reusable SaaS product foundation for Comvestec Solutions.

That means the real goal is not only to make one website or one app look good. The goal is to build a stable base that can be reused across:

- the public website
- the customer product application
- the admin or operator application
- future modules such as billing, notifications, branding, compliance, search, and governance

The project is intentionally backend-first. In simple terms, that means the team is making the important rules work first before building lots of screens.

Those important rules include:

- authentication
- authorization
- billing and entitlements
- audit history
- configuration management
- security and field-level redaction
- tenant isolation
- operator recovery flows

The strongest current vertical slice today is the backend-ready subscriber journey. It now reaches the live-environment readiness milestone through the shared H3 backend layer and readiness harness, including authentication, session establishment, public-web hosted checkout handoff, product bootstrap, billing processing, webhook intake, workflow jobs, runtime governance, backend checkout-session creation, and cross-cutting governance, support, retention, billing, file-storage, search, and webhook route probes. Alongside that subscriber-journey slice, the repository now also has a validated retention legal-hold governance control plane, a validated file-storage lifecycle slice with Convex-backed managed uploads, metadata, delegated access checks, target-attributed file-level audit records, and both first-party and backend-owned transport entrypoints over the shared service, plus validated search, import-export, and observability foundations that include OpenPanel-backed business-event wiring, support-case export coverage, and started-container deployment validation. Register and delete currently keep their post-commit audit append as best-effort across the Convex/PostgreSQL boundary. The backend-ready subscriber-journey milestone remains the reference completion target, but current workspace validation still has broader repo baseline follow-up; broader search/import-export breadth and richer first-party experience layers are follow-on expansion work, not the design target for that milestone.

The three app frontends are intentionally thin right now. That is not accidental. It is a product decision. The repository is trying to avoid fake completeness in the UI before the shared backend services are trustworthy.

## What This Project Is

At a high level, this project is a governed modular SaaS foundation.

That phrase means:

- governed: decisions, standards, and maturity are documented in specs, ADRs, manifests, and the implementation tracker
- modular: capabilities are separated into named modules with boundaries, instead of becoming one large pile of mixed code
- SaaS foundation: the repo is meant to support a software-as-a-service platform with tenants, billing, permissions, branding, and operations

### The Three Main Applications

The repo has three first-class applications:

1. Public web
   What it is: the outward-facing website for landing pages, plan discovery, trust signals, and subscription entry points.
   Why it exists: customers need a clean public entry point that is safe to expose before login.

2. Product app
   What it is: the authenticated customer-facing application.
   Why it exists: this is where entitled users eventually access the actual product experience.

3. Admin app
   What it is: the internal operator and governance application.
   Why it exists: platform staff need a controlled place to inspect state, review changes, repair failures, and manage governed settings.

### The Shared Packages

The applications are thin on purpose because the real platform behavior lives in shared packages.

| Area                 | Plain-English meaning                                                                                        | Why it matters                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `packages/contracts` | Shared rules for what data looks like and what names are allowed.                                            | Keeps every layer speaking the same language.                         |
| `packages/config`    | Shared defaults, module manifests, feature flags, and config declarations.                                   | Prevents random hidden config from spreading across the repo.         |
| `packages/modules`   | Business capabilities such as runtime config, field security, identity session, billing, and governance.     | This is where core platform behavior is supposed to live.             |
| `packages/platform`  | Shared services, app helpers, backend HTTP handlers, adapters, request boundaries, and environment handling. | This connects apps, modules, and outside systems.                     |
| `convex`             | Convex-backed workflow and reactive state pieces.                                                            | Used for interactive application state and workflow execution.        |
| `ops/docker`         | Local infrastructure definitions.                                                                            | Lets the whole platform run locally with the expected services.       |
| `specs`              | Product, platform, module, and operations documentation.                                                     | Explains intended design and current maturity.                        |
| `tests`              | Automated validation.                                                                                        | Reduces drift between what the repo claims and what it actually does. |

## Why This Project Exists

This project exists because Comvestec does not want a one-off application that solves only one immediate need and becomes hard to extend.

The repository exists to create a repeatable platform base that can support multiple tenants, multiple apps, and multiple governed modules without having to rebuild the same foundations every time.

In practical terms, it exists to solve these problems:

1. Shared business rules should not be rewritten inside every app.
2. Security rules should not depend on frontends behaving correctly.
3. Billing, configuration, and audit behavior need durable storage and traceability.
4. Admin and operator actions need approval, history, and accountability.
5. The same backend logic should be usable by first-party apps, tooling, webhooks, and future integrations.

## The Main Architectural Choices And Why They Exist

### 1. Modular monolith instead of microservices

The platform is built as a modular monolith.

Plain English meaning: it is one coordinated system with clear internal module boundaries, instead of many small separately deployed services.

Why it works this way:

- it is simpler to reason about while the platform is still growing
- shared rules stay centralized
- cross-cutting concerns like auth, field security, and audit are easier to enforce consistently
- the team avoids premature distributed-system complexity

### 2. Backend-first delivery

The repository deliberately builds backend flows before rich frontend experiences.

Why it works this way:

- a nice screen is not useful if billing, auth, or tenant isolation is wrong
- operators need real data and real workflows, not demo UI placeholders
- backend services can be reused by all three apps and by external integrations

This is why the current public web and admin app are very minimal.

### 3. Thin app shells over shared services

The frontend apps are not supposed to own the real business logic.

Why it works this way:

- app code stays small and easier to change
- the same shared backend behavior can serve multiple entry points
- security, audit, and billing logic do not drift into separate app-specific copies

The current route files show this pattern clearly:

- public web delegates auth start to shared platform logic
- product app delegates product bootstrap to shared platform logic
- product auth callback delegates session completion to shared platform logic
- admin app now delegates tenant repair inspection, replay, and cancellation to shared platform logic while broader governance UI remains intentionally narrow

### 4. Two transport layers, one shared logic core

The project draws a clear line between two ways of reaching backend behavior:

1. First-party app transport
   This is when the public web, product app, or admin app calls shared app helpers through server functions or route-owned server logic.

2. Backend-owned HTTP transport
   This is when true external callers, tooling, smoke tests, and webhook providers call the dedicated backend HTTP API.

Why this matters:

- first-party app routes stay thin
- external integrations still have a real API boundary
- the reusable business logic is not duplicated in both places

### 5. Convex plus PostgreSQL split

The platform uses two main state systems for different reasons.

Convex is used for interactive application state and workflow-style execution where reactivity is useful.

PostgreSQL is used as the durable source of truth for areas that need governance and history, especially:

- audit
- config
- billing
- entitlements
- webhook idempotency
- compliance-oriented records
- operator recovery state

Why it works this way:

- not all data has the same importance or usage pattern
- governance-heavy state needs durable, queryable, reviewable storage
- reactive application state benefits from a different model

### 6. Keycloak for identity, Ory Keto for authorization boundary, Valkey for session and cache support

Keycloak handles identity and login.

Ory Keto-backed delegated checks are already the current authorization source of truth for the validated authorization slice.

Valkey supports fast session and cache behavior.

Why it works this way:

- identity, authorization, and fast transport state are different concerns
- separating these concerns makes future growth safer
- the repo can enforce stronger tenant isolation and operator workflows over time

### 7. Effect as the backend runtime backbone

Effect is used heavily in shared backend logic.

Plain English meaning: the project prefers strongly typed, explicit, predictable runtime behavior instead of loosely connected async code.

Why it works this way:

- errors stay more explicit
- input validation stays closer to the boundary
- contracts and runtime behavior stay aligned
- backend workflows are easier to compose and test

## How To Read The Maturity Words In This Repo

The repo uses five status words in the implementation tracker.

| Status        | Plain-English meaning                                                                      |
| ------------- | ------------------------------------------------------------------------------------------ |
| `documented`  | The idea is described, but there is little or no real implementation yet.                  |
| `scaffolded`  | Some code or structure exists, but it is still incomplete or not fully wired.              |
| `implemented` | The main behavior exists and works in code, but there are still meaningful follow-up gaps. |
| `validated`   | The implementation, tests, and documentation are aligned for that area.                    |
| `blocked`     | Progress depends on another unresolved dependency or decision.                             |

## What Is Working Today

This section focuses on real current behavior, not future ambition.

### Foundation pieces that are already strong

The implementation tracker shows a broad set of validated foundations already in place:

1. Shared contracts and config baseline.
2. No-redeploy runtime config sync.
3. Authorization and delegated access enforcement.
4. Feature flags.
5. Backend-owned HTTP API layer.
6. Identity session handling.
7. Billing and metering core slice.
8. Workflow jobs.
9. Webhooks API access.
10. Field security.
11. Convex identity-backed execution for current workflows.
12. Public web shell and product app shell with shared backend helpers.
13. Retention and legal hold.
14. File storage lifecycle and delegated access enforcement.
15. Notification center email, digest, and in-app foundation.

These are important because they form the real reusable platform base.

### Current app state by application

#### Public web

Current reality:

- The root page is intentionally a thin shell, not a full marketing site.
- It explains that frontend discovery is deferred while the backend subscriber journey becomes authoritative.
- The real working route of substance today is the auth-start route.

What is working:

- `apps/public-web/src/routes/auth/start.ts` forwards the request to shared auth-start handling.
- `apps/public-web/src/auth/start-route.ts` validates query input, prepares auth-start input from environment and request data, creates or preserves a correlation id, and redirects the user to the identity flow.

Why it works this way:

- auth-start is security-sensitive and should not be implemented ad hoc in route components
- shared logic avoids drift between public-web and other entry points
- correlation and validation belong at the backend boundary

What this means for stakeholders:

- the public web is currently more of a controlled entry shell than a polished customer-facing experience
- the important flow that already exists is the trusted handoff into authentication

#### Product app

Current reality:

- The root route already does meaningful backend-backed work.
- It is not just a static page.
- It either shows a safe shell or a real bootstrap result, depending on session validity.

What is working:

- `apps/product-app/src/routes/index.tsx` calls a server function for route data.
- `apps/product-app/src/lib/home-route-server.ts` wraps the request in middleware and delegates to shared route data loading.
- `apps/product-app/src/lib/home-route-data.ts` calls the shared product bootstrap builder.
- If the session is missing or no request context can be found, the code intentionally returns a shell view instead of fake demo data.
- If the session is valid, the route renders backend-resolved bootstrap data, including authorization outcome, request actor, tenant, enabled modules, and billing status.

Why it works this way:

- the product app must not guess whether a user is entitled to see tenant data
- bootstrap must come from validated backend state
- hiding missing session problems behind mock data would create false confidence

What this means for stakeholders:

- the product app already has the correct shape for a secure SaaS shell
- it is still early in UI depth, but the route ownership and backend bootstrap pattern are real

#### Product auth callback

Current reality:

- the callback route is a real backend-backed piece of the subscriber journey
- it is not a fake placeholder

What is working:

- `apps/product-app/src/routes/auth/callback.ts` forwards the request to shared callback handling.
- `apps/product-app/src/auth/callback-route.ts` checks for provider errors, validates query fields, validates callback state, checks the redirect URI, completes authentication through shared services, sets the subscriber journey session cookie, and redirects to the product home route.

Why it works this way:

- callback handling is one of the highest-risk points for security mistakes
- signed state, redirect validation, correlation handling, and session establishment must stay centralized
- a shared backend implementation is safer than repeating this logic in app-local code

What this means for stakeholders:

- the login completion path is already a real platform capability
- the route is thin by design because its job is to hand off to trusted shared services, not to own business logic itself

#### Admin app

Current reality:

- the admin app now includes a targeted tenant repair console, but it is still far from a full operator workbench
- this is still a governance-led rollout, not an omission caused by forgetting the UI

What is working:

- the admin app can inspect tenant repair gaps and invoke replay or cancellation through shared backend services
- broader operator UI still remains deferred until governance mutations, audit review, and authorization are validated end to end in shared backend services

Why it works this way:

- targeted operator UI can ship once the underlying control is trustworthy enough to expose safely
- the repo is still avoiding the common mistake of building broad admin screens before audit, authorization, and approval flows are solid

What this means for stakeholders:

- the admin app is not feature complete today
- tenant repair workflows are now accessible without routing first-party operators through backend-owned HTTP handlers
- the responsible backend work is still being prioritized before the UI is widened

## How The Current Working Flow Works Today

The clearest current business flow is the early subscriber journey.

Below is the current plain-English sequence for the implemented auth, checkout handoff, and bootstrap portion of that journey.

### Step 1: A visitor reaches the public web

Today the public web home route is intentionally simple. It is there to represent the shell, the platform positioning, and the entry point.

This is not yet the final polished sales experience.

### Step 2: The visitor starts authentication or checkout from the public web

The public web auth-start and hosted-checkout routes receive the request.

It then:

1. reads optional query hints such as tenant information
2. validates that input against expected rules
3. captures or creates a correlation id, which is a tracking id used to follow a request across services
4. resolves approved public-web billing return URLs when the request is starting checkout
5. builds a backend-owned auth-start input, including a signed post-auth handoff path when checkout should continue in the product app
6. calls shared platform logic to begin subscriber authentication
7. redirects the browser to the identity provider flow

This works because the shared platform layer owns the validation, request boundary behavior, and redirect preparation.

### Step 3: The identity provider sends the user back to the product app callback

After login, the product app callback route receives the identity provider response.

It then:

1. checks whether the provider returned an explicit error
2. validates the required callback query values
3. decodes and validates the callback state
4. checks that the redirect URI in the state matches the real callback request
5. completes authentication through shared backend services
6. creates a subscriber journey session cookie
7. redirects the user to either the product app home route or the signed hosted-checkout handoff path

This works because the shared backend logic protects the callback contract and session creation, instead of trusting the browser or route-local code.

### Step 4: If checkout was requested, the product app starts hosted checkout through the same backend-owned boundary

The product app checkout route validates the signed plan and price input, accepts only the approved public-web success and cancel return URLs, resolves subscriber request context from stored backend session state, and creates the provider checkout session through shared billing services.

The provider may later return the browser to thin public-web success or cancel routes, but those pages remain advisory. Real entitlement activation still comes from verified backend webhook processing.

### Step 5: The product app home route requests bootstrap data

The product home route runs a server-side loader.

That loader does not directly read random cookies or invent tenant data itself.

Instead it delegates to shared product bootstrap logic.

That shared logic is responsible for building the bootstrap result from the incoming request and current environment.

### Step 6: The backend decides whether the user has a usable session

The product home data loader intentionally handles two missing-session cases:

- the session id is missing
- the session exists in transport terms but request context cannot be found

In those cases, the route returns a shell result instead of protected tenant data.

This is important because it prevents the app from pretending access exists when the secure backend state is missing.

### Step 7: If the session is valid, the product shell renders real backend results

When bootstrap succeeds, the product app can display:

- authorization outcome
- request actor type
- resolved tenant scope and id
- enabled module count
- billing status
- projected application snapshot data

This works because shared backend services already assemble those decisions before the route renders.

### Step 7: Backend-owned HTTP APIs handle external and system-driven work

The repo also has a dedicated backend-owned HTTP layer.

That layer exists for:

- external callers
- webhooks
- tooling
- smoke tests
- non-app callers that need an explicit backend API boundary

The shared backend API app currently wires together:

- subscriber journey handlers
- admin billing handlers
- admin governance handlers
- webhooks API handlers
- generated OpenAPI and Swagger documentation routes

Why this matters:

- app routes stay thin
- external-facing behavior still has a formal API layer
- one shared logic core can serve both worlds

### Step 8: Billing, webhooks, and durable workflow state are already part of the real design

The repo's current backend slice already includes durable billing-related behavior in PostgreSQL-backed modules and workflow jobs.

That includes core handling for:

- billing webhook processing
- customer account mapping
- subscription and entitlement state
- workflow-job-based recovery or reconciliation paths
- webhooks API intake and replay support
- operator-managed outbound webhook subscription management
- operator-managed outbound webhook API key lifecycle
- PostgreSQL-backed outbound webhook delivery logs
- workflow-jobs-backed outbound delivery retry or backoff over authenticated Convex dispatch and execution
- backend-owned outbound request-delivery transport

This matters because a serious SaaS platform cannot depend on frontend query strings or one-time browser returns to decide whether a customer has paid.

The durable truth must come from backend-owned verified state.

## Why The Apps Look So Minimal Right Now

This is one of the easiest things for a stakeholder to misunderstand, so it is worth stating plainly.

The public web and admin app are not sparse because the repo is confused about product direction.

They are sparse because the repository is intentionally refusing to present unfinished backend workflows as if they were complete product features.

That is a discipline choice.

The current UI posture is saying:

- do not fake admin power before audit and authorization are real
- do not fake product entitlement before billing and session state are real
- do not hide backend incompleteness behind polished demo screens

This is safer, more honest, and more reusable in the long run.

## Current Working Areas By Capability

The table below translates the current tracker status into stakeholder language.

| Capability area                      | Current status | What that means in plain English                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared contracts and config baseline | Validated      | The repo has a stable, validated common language for data, config declarations, and module manifests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| No-redeploy runtime config sync      | Validated      | Configuration can be governed and synchronized without pretending that code and runtime state are unrelated, and that runtime sync path is now validated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Public web app                       | Validated      | The app remains intentionally thin, but the current backend-backed public-web shell pattern is now validated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Product app                          | Validated      | The product app remains intentionally thin, but the current backend-backed auth, bootstrap, and billing shell pattern is now validated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Admin app                            | Scaffolded     | The app now includes a targeted tenant repair console, but broader operator UI remains deliberately incomplete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Backend-owned HTTP API layer         | Validated      | The platform has a dedicated external and system-facing API boundary with docs routes, trusted-session middleware, correlation propagation, and a green live readiness harness over the shared backend-owned routes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Identity session                     | Validated      | Session start or completion and request-context transport are real current capabilities with tracker-aligned validated request-context handling.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Billing and metering                 | Validated      | Core billing, webhook processing, entitlements, repair workflows, and operator-triggered repair-gap controls now ship through validated shared backend services and transport.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Workflow jobs                        | Validated      | Long-running and repair-oriented backend work now uses a validated shared workflow control plane with operator replay and cancellation transport.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Webhooks API access                  | Validated      | Provider webhook intake and replay are first-class backend concerns, and the module now also ships validated operator-managed outbound subscription and API-key control, PostgreSQL-backed outbound delivery logs, workflow-jobs-backed retry or backoff orchestration, authenticated Convex dispatch and execution wiring, and backend-owned request-delivery transport over durable PostgreSQL state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Field security                       | Validated      | Sensitive fields are actively projected and redacted based on actor type through validated projection and audit-safe backend behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Authorization                        | Validated      | Ory Keto-backed delegated checks, bounded cache behavior, and break-glass expiry enforcement are validated today, while operator tuple withdrawal and review remain follow-up work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Runtime governance                   | Validated      | Runtime config governance is one of the strongest validated slices in the platform today.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Tenant management                    | Validated      | Tenant onboarding review, membership inspection and mutation, invitation issue, inspect, revoke, reminder, expiry-notification, authenticated redemption, and an email-backed invitation issuance path with manual-handoff fallback now ship through validated shared backend services and trusted-session HTTP transport.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Tenant branding                      | Validated      | Stored branding projections now feed public/product app snapshots plus tenant-scoped admin snapshot previews with support-operator redaction of confidential reply-to and custom-domain-host fields, tenant-hinted public auth-start, backend-owned auth-start transport, and hosted-checkout display-name and theme handoff, branded email sender identity, notification-center email dispatch, PostgreSQL-backed custom-domain request and lifecycle mutation workflows, and validated managed asset publication over the shared file-storage boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Observability                        | Validated      | The stack exists, the shared request boundary now emits OTLP-backed request traces, the backend health surface exposes aggregated provider-aware readiness diagnostics, uncaught backend request failures flow through the GlitchTip adapter when observability env is configured, and search plus import-export emit OpenPanel-backed business events through one shared server-side emitter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Notification center                  | Validated      | Notification center now persists PostgreSQL-backed email receipt records for the `billing.invoice-ready` orchestration path over Novu and validated email delivery, including queued and queue-failed outcomes linked to the shared email-delivery message id plus suppressed outcomes that persist without a provider message id, exact tenant-aware recipient and template preference overrides, tenant-scoped digest scheduling, actor-targeted in-app notification state over a Convex-backed store, and session-bound backend inspection and preference-management routes; broader non-email channels remain future work.                                                                                                                                                                                                                                                                                                                                                                                              |
| Email delivery                       | Validated      | A Postal-backed branded sender path now persists delivery and suppression records in PostgreSQL through a concrete Drizzle-backed queryable, forwards notification template ids through the shared backend service, accepts provider delivery-state updates, exposes verified backend-owned Postal provider intake plus operator-safe tracked-delivery and suppression inspection through backend routes, has environment-backed live Postal runtime wiring, and now owns a code-reviewed versioned template registry across tenant invitation issuance, reminder, expiry-notification, and the first notification-center-backed `billing.invoice-ready` system email consumer. Beyond that validated foundation, the module now also contains implemented code-owned render contracts for `identity-session.password-reset`, `identity-session.email-verification`, `identity-session.mfa-code`, `notification-center.welcome-campaign`, and `notification-center.newsletter` for future identity and engagement delivery. |
| Feature flags                        | Validated      | Entitlement-aware evaluation, including the module-enabled entitlement boundary, now flows through an Unleash-backed rollout evaluator, dependency-aware and retirement-aware runtime resolution, richer admin-governance projected reads, and retired-override rejection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Search                               | Validated      | Tenant index lifecycle, operator controls, durable state, backend API routes, managed-file summary resync during tenant ensure, support-case preview query transport, stored-settings operator reindex requests, optional managed-file synonym settings, repair-gap replay through the shared workflow-jobs owner surface, operator preview queries, current-tenant managed-file summary query, and shared OpenPanel-backed business-event emission now form a validated backend foundation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Import and export                    | Validated      | Managed-file-summary JSON and CSV export jobs plus support-case-summary JSON export now persist durable PostgreSQL-backed status, reuse the shared workflow control plane for dispatch, execution, and replay, upload and register export artifacts through the shared file-storage boundary, emit shared OpenPanel-backed request and completion events, and expose session-bound backend request and inspection routes as a validated backend foundation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Retention and legal hold             | Validated      | Retention policies, legal-hold placement or release, PostgreSQL-backed persistence, backend API routes, and operator-facing governance flows are now implemented and repository-validated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| File storage                         | Validated      | Managed uploads, target-scoped limits, retention-aware deletion, target-attributed file-level audit coverage, and both first-party and backend-owned transport entrypoints are implemented and repository-validated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Support operations                   | Validated      | A session-backed support-operations service now persists Keycloak-backed impersonation and break-glass audit evidence, review flows, active-session inventory, revocation, support-safe case management, and tenant-health aggregation through validated shared backend services and transport.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## What Is Already Strong From A Governance And Security Perspective

Even though the frontends are still thin, several important risk-heavy areas are already being treated seriously.

### Field-level data access

The repo explicitly enforces field redaction rules.

That means different actor types should not see the same data by default.

Examples from the tracker:

- `regulated-sensitive` data is redacted for non-privileged actors
- `secret` data is always redacted
- anonymous actors only see `public` fields

Why this matters:

- the UI is not trusted to hide sensitive data correctly on its own
- security is enforced in shared backend logic

### Break-glass and tenant isolation hardening

The tracker records explicit hardening around break-glass expiry, tenant isolation, and bounded caches.

Why this matters:

- emergency access should never remain open forever
- cross-tenant leakage is one of the most dangerous SaaS failures
- cache growth must be bounded to avoid hidden runtime problems

### Runtime config governance

The runtime config system is one of the most mature parts of the platform.

This matters because modern SaaS platforms need configuration that is:

- declared in code
- visible to operators
- auditable
- changeable without redeploy where appropriate
- synchronized between code-declared truth and runtime-effective state

## What Infrastructure Exists Today And Why

The local platform stack is broad because the repo is building a real SaaS foundation, not only a frontend demo.

### Core state and runtime services

- PostgreSQL: durable system of record for governance-heavy state
- Convex: reactive app-state and workflow support
- Valkey: fast session and cache support
- Unleash: feature flag boundary

### Identity and access services

- Keycloak: authentication and identity
- Ory Keto: live delegated authorization boundary

### Billing, messaging, and search services

- Polar: billing provider boundary
- OpenMeter: metering
- Novu: notification boundary
- Postal: email delivery boundary
- Meilisearch: search boundary

### Observability and platform operations services

- OpenTelemetry Collector
- Prometheus
- Loki
- Tempo
- Grafana
- GlitchTip
- OpenPanel
- Kong
- Vault

Why so many services exist already:

- the repository is trying to set the real platform footprint early
- operators need a believable local environment
- integrations need boundaries before richer product experiences are built

Important nuance:

not every service in the stack is fully wired to business behavior yet. Some are present because they are part of the intended foundation, while their module-level workflows still need live operator evidence or deeper integration validation before they can be called fully complete.

## What Is Still Not Finished Yet

This is the most important honesty section.

The repo is not claiming full product completion.

### Public web gaps

The public web still needs:

- richer landing and discovery experience
- stronger public-safe plan catalog presentation

Why this is not done yet:

- the backend-ready subscriber journey is now the source of truth, so the remaining public-web work is presentation and discovery breadth rather than backend completion
- the team is avoiding UI-first behavior that would later need to be torn out

### Product app gaps

The product app still needs:

- richer entitled in-product screens

The product app now has thin logout and stale-session recovery routes that clear
first-party session transport, invalidate backend session state, and persist
logout or stale-session lifecycle evidence when the stored session context is
still present before redirecting back to the shell.

Why this is not done yet:

- the secure session and entitlement bootstrap pattern had to come first
- product screens should expand on top of real backend-backed access decisions

### Admin app gaps

The admin app still needs:

- direct governance mutation screens
- richer audit review interfaces
- explicit billing reconciliation controls in the UI
- broader tenant and operator repair surfaces

Why this is not done yet:

- admin actions are high-risk and should not outrun audit, auth, and projection safety
- the backend control surfaces must be trustworthy before the UI exposes them

### Authorization follow-up gaps

The authorization module's core delegated enforcement is now validated, but it still needs broader operator tuple-revocation and review workflows.

Why this is not done yet:

- the Ory Keto-backed delegated check path, bounded cache behavior, and break-glass expiry validation are already in place
- the remaining work is operational withdrawal and review coverage, not the core enforcement model itself

### Observability follow-up

Observability is now validated.

Future follow-up:

- keep future backend-owned business events on the shared emitter and readiness path instead of reintroducing per-module observability seams

Why this matters:

- running services is not the same as having useful operational visibility

### Communication and engagement gaps

Still incomplete:

- additional non-email channel orchestration and broader notification event families
- broader dispatched system-email workflows beyond the now-landed invitation issuance, reminder, expiry-notification, the `billing.invoice-ready` template and delivery tracking baseline, and the code-owned identity plus engagement render contracts now registered in `email-delivery`
- broader feature-flag rollout-management evidence and operator lifecycle controls over the validated dependency-aware Unleash-backed evaluator
- broader tenant-scoped search document families and broader relevance controls

### Governance and compliance gaps

Still incomplete:

- downstream retention guard enforcement in destructive file-lifecycle and export workflows
- richer support operations and impersonation-style workflows
- broader audit review workflows beyond current slices

### Deployment and environment notes

The repo-owned deployment baseline now validates:

- the rendered Compose model and full service inventory
- published host-port conflicts before Docker is invoked
- non-interactive started-container state and health assertions, including the one-shot `postgres-bootstrap` container contract

Current workspace-specific, non-blocking operator note:

- the presently running local stack in this workspace is missing `novu`, `openmeter`, `postal`, and `postgres-bootstrap`, so `bun run ops:docker:validate-local -- --env-file .env.example --started-containers` currently reports real stack drift until those services are started with the intended Vault-backed runtime environment; this is an environment-state note, not a tracker-status blocker beyond the separate repo-wide formatting gate

## How The Unfinished Pieces Are Expected To Work

The repository is not leaving the future vague. The roadmap and specs are quite clear about the intended direction.

### Subscriber journey backend-ready target

The roadmap's backend-ready milestone is now the current source of truth:

1. a user can view a public-safe plan catalog
2. start authentication
3. complete identity callback
4. start hosted checkout
5. complete payment
6. have verified webhooks reconcile the result
7. receive tenant provisioning and entitlements
8. reach an authorized product bootstrap response

The important part is not only the user experience. The important part is that all of this should happen without operators manually fixing runtime state behind the scenes.

### Future public web behavior

The public web is expected to remain a thin first-party shell.

That means:

- it will call shared app helpers and shared backend services
- it should not become a separate business-logic engine
- it should not talk to internal backend adapters in ad hoc ways

### Future product app behavior

The product app is expected to grow on top of backend-resolved entitlements and session state.

That means:

- tenant access should come from persisted entitlements, not URL parameters
- route-owned loaders and server functions should keep owning the cold-start bootstrap
- live reactive behavior can be added later where it genuinely helps, especially through Convex

### Future admin app behavior

The admin app is expected to become the operator surface for:

- runtime config review and mutation
- audit review
- billing repair actions
- governance approvals
- branding management
- support and compliance workflows

But it is expected to do this through the same shared services and trusted-session rules as any other caller.

That means the admin UI should not become a bypass around backend policy.

### Future billing and recovery behavior

The roadmap expects the billing slice to grow into:

- hosted checkout creation and return handling
- verified idempotent webhook processing
- durable customer and subscription linkage
- failed-payment and cancelled-subscription handling
- repair and replay flows for provider lag or missing onboarding
- metering and quota enforcement behind entitlement state

### Future security model

The target security posture is:

- trusted session state
- backend-owned request context
- durable audit history
- field-level security at projection time
- Ory-backed authorization enforcement
- strong tenant isolation
- time-bounded break-glass access

## What Stakeholders Should Understand Clearly

This project is already doing meaningful platform work, but it is not pretending to be a finished SaaS product.

That distinction matters.

What is real today:

- the architectural base
- the governed module model
- the thin-shell app pattern
- the backend-ready subscriber journey and live readiness harness
- the product bootstrap pattern
- the backend-owned API boundary
- billing, webhook, workflow, and runtime-governance foundations
- strong attention to security and audit concerns

What is intentionally incomplete today:

- rich public-web storytelling and checkout UX
- broad product UI depth
- full admin operator experience
- broader search/import-export breadth and additional non-email orchestration on top of the current validated backend foundations

For backend completion itself, the blocker list is now empty in the current workspace. What remains intentionally incomplete is expansion work on top of the validated backend foundation, not missing completion-critical slices.

What that means in plain language:

- the foundation is becoming trustworthy before it becomes flashy
- the repo is optimized for long-term platform quality, not short-term UI cosmetics
- the current state is honest and deliberate, not random

## Short Answer: Why It Works This Way

If a stakeholder asks for the shortest possible explanation, it is this:

The project works this way because Comvestec is building a reusable SaaS platform foundation, not just decorating a single app. The team is putting authentication, billing, configuration, governance, tenant isolation, and auditability in the shared backend first, then letting the three apps become thin entry points over that trusted backend behavior. That makes the platform slower to look complete, but much safer and much more reusable.

## Recommended Follow-Up Documents For Stakeholders

If a reader wants to go deeper after this summary, these are the best next documents:

1. [implementation-tracker.md](implementation-tracker.md) for honest current maturity.
2. [backend-readiness-roadmap.md](backend-readiness-roadmap.md) for the intended next backend slice.
3. [../../README.md](../../README.md) for the architecture snapshot and repo map.
4. [../02-apps/public-web/spec.md](../02-apps/public-web/spec.md), [../02-apps/product-app/spec.md](../02-apps/product-app/spec.md), and [../02-apps/admin-app/spec.md](../02-apps/admin-app/spec.md) for the role of each app.
