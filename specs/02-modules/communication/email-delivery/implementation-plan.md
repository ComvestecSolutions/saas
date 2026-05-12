# Email Delivery Template Implementation Plan

Status: planning

Last updated: 2026-05-12

## Outcome

Implement the current email template family as production-safe, dark-mode templates over the validated `email-delivery` boundary. The implemented slice must:

1. Translate the accepted design direction into email-safe HTML and plaintext instead of shipping the raw Stitch or Tailwind concept files.
2. Reuse one repo-owned template foundation across billing, invitation, identity, and engagement families.
3. Keep the live billing and invitation workflows on the existing tracked-delivery, suppression, and tenant-branding-aware sender path.
4. Remove unsupported mock data, fake controls, and unapproved workflow steps from the implementation.
5. Bump template version strings whenever the rendered subject or body changes materially so tracked-delivery history stays honest.

## Governing specs for this plan

1. The primary `email-delivery` scope is governed by:
   - `manifest.md`
   - `delivery-tracking-and-suppression.md`
   - `template-registry-and-invitation-delivery.md`
2. The existing render-contract specs for identity and notification templates still govern their allowed inputs and non-goals.
3. `billing.invoice-ready-digest` also depends on `../notification-center/digest-scheduling.md`, which remains the accepted source of truth for digest producer behavior and must not be widened implicitly by template work.

## Current implementation baseline

| Area                   | Current state                                                                                                                                                                         | Planning implication                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Delivery runtime       | `email-delivery` is already `validated` in the implementation tracker and owns PostgreSQL-backed tracking, suppressions, provider events, and sender branding                         | This is a visual and template implementation slice, not a new delivery architecture |
| Live producers         | `notification-center` already sends `billing.invoice-ready` and `billing.invoice-ready-digest`; `admin-tenant-management` already sends invitation issue, reminder, and expiry emails | Implement these families first because they affect real sends now                   |
| Render-only templates  | Identity verification, password reset, MFA, welcome-campaign, and newsletter render contracts exist with tests but are not yet wired to real producer flows                           | These can adopt the shared foundation after the live families                       |
| Current renderer shape | Template helpers currently emit versioned `template` tracking identifiers plus `subject`, `html`, and `text` strings from TypeScript helpers                                          | The plan should improve structure without forcing caller-owned HTML                 |
| Design inputs          | The dark-mode concepts live in this folder plus `stitch-prompts/`                                                                                                                     | Treat them as visual references, not production HTML                                |
| Email tooling          | The repo has no existing React Email, MJML, or inliner dependency                                                                                                                     | Prefer repo-owned TypeScript helpers over adding a new email stack                  |

## Proposed implementation decisions

| Area                       | Decision                                                                                                                                                  | Why                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Source-of-truth order      | Accepted spec or manifest + implementation tracker -> Stitch prompts -> concept HTML or screens                                                           | The design files contain workflow and data drift; specs still govern behavior                                     |
| Production template format | Use repo-owned inline-safe HTML and CSS helpers in TypeScript                                                                                             | Email clients will not execute Tailwind CDN scripts, runtime config JS, or app-style hover chrome                 |
| Shared template foundation | Create a shared email foundation under `packages/platform/src/services/communication/email-delivery-templates/` instead of per-template duplicated markup | All families share the same dark-mode system, CTA treatment, footer grammar, and text fallback rules              |
| Branding ownership         | Compose branded header and footer chrome inside `email-delivery` after tenant-branding resolution, not in producer-owned calls                            | This keeps approved email chrome inside the delivery boundary alongside sender identity                           |
| Typography strategy        | Use design-system-inspired stacks with email-safe fallbacks; do not rely on required remote font downloads                                                | The concepts use Inter, Metropolis, and JetBrains Mono, but email clients need graceful fallback behavior         |
| Versioning rule            | Any template whose subject or rendered body changes materially moves from `@v1` to `@v2` in the same slice                                                | Delivery tracking should distinguish the new design implementation from the current minimal output                |
| Surface selection in v1    | Use one canonical surface per current workflow; do not add runtime surface branching until specs pass an explicit surface input                           | The current render contracts do not carry reliable `public-web`, `product-app`, or `admin-app` selection metadata |
| Unsupported mock data      | Remove or defer any design field that is not backed by the accepted schema                                                                                | This avoids accidental contract expansion and keeps the slice spec-first                                          |

## Surface mapping for this slice

### Live workflow-backed mappings

| Template or family                                            | Current surface                | Decision                                                                                                              |
| ------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `billing.invoice-ready`                                       | `product-app` operational      | Matches the current billing notification workflow and destination workspace posture                                   |
| `billing.invoice-ready-digest`                                | `product-app` operational      | Same billing family as the single-invoice email and remains governed by `../notification-center/digest-scheduling.md` |
| `tenant-management.membership-invitation`                     | `product-app` tenant-workspace | Current accepted workflow is tenant invitation delivery, not operator-staff onboarding                                |
| `tenant-management.membership-invitation-reminder`            | `product-app` tenant-workspace | Keep reminder styling in the same invitation family                                                                   |
| `tenant-management.membership-invitation-expiry-notification` | `product-app` tenant-workspace | Keep expired-state styling in the same invitation family                                                              |

### Render-only visual defaults pending producer specs

The rows below are presentational defaults for template implementation only. They do **not** establish new runtime workflow ownership or app-surface routing until accepted producer specs wire them.

| Template or family                     | Visual default now       | Reason                                                                                                 |
| -------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `identity-session.email-verification`  | neutral security shell   | The originating app surface is not passed through the current render contract yet                      |
| `identity-session.password-reset`      | neutral security shell   | Same reason as verification                                                                            |
| `identity-session.mfa-code`            | neutral security shell   | Same reason as verification, with stronger code emphasis                                               |
| `notification-center.welcome-campaign` | `product-app` onboarding | The current contract is workspace-oriented and checklist-driven, but producer wiring is still deferred |
| `notification-center.newsletter`       | `public-web` editorial   | This matches the accepted editorial posture, but producer wiring is still deferred                     |

## Design normalization decisions

### 1. Raw concept HTML will not ship

The files in `specs/02-modules/communication/email-delivery/**/code.html` are concept references only. The implementation will not ship:

1. Tailwind CDN scripts or runtime Tailwind config blocks.
2. Google-font or Material Symbols dependencies as required rendering behavior.
3. Fixed headers, hover states, or app-screen interactions that do not exist in email clients.
4. Placeholder `href="#"` links.
5. Remote stock or concept images as mandatory content.

### 2. Mock-only or unsupported details that will not ship in v1

| Template                                  | Remove or defer                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `identity-session.mfa-code`               | Device, IP, and location telemetry rows; separate “secure your account immediately” support workflow                      |
| `billing.invoice-ready`                   | Account id, billing period, support mailbox, and other metadata not present in the current typed input                    |
| `billing.invoice-ready-digest`            | Computed total-outstanding amount and overdue math not present in the current digest item contract                        |
| `tenant-management.membership-invitation` | Audit reference ids, “Elevated” role chips, and operator-only control-tower framing from `operator_membership_invitation` |
| `notification-center.welcome-campaign`    | Fake `Pending` or `Optional` status chips and decorative header icons with no email meaning                               |
| `notification-center.newsletter`          | Required hero image or separate lead-story asset unless a future spec adds media-backed content explicitly                |

### 3. Template-family rules that become canonical

1. **Identity family** stays minimal, security-first, and calm. MFA gets the strongest visual hierarchy, but no speculative telemetry ships by default.
2. **Billing family** uses one dominant invoice summary treatment. The digest becomes denser through stacked rows, not through dashboard-like tables or computed finance widgets.
3. **Invitation family** is one tenant-workspace family for this slice: initial invite, pending reminder, and expired state. The `operator_membership_invitation` concept is treated as a future operator-invite variant, not the source of truth for the current tenant-management flow.
4. **Welcome** turns `nextSteps` into a checklist-style layout, but those steps remain plain content items, not a fake state machine.
5. **Newsletter** may visually promote the first highlight as the lead item if one exists, but it must derive from the existing structured highlights array rather than from a new image or body schema.
6. **Transactional footers** stay calm and minimal. Only newsletter and other explicitly preference-aware templates should surface unsubscribe or preference-management language directly.

## Implementation architecture

1. Keep template ids and typed render contracts in committed code as the stable boundary.
2. Introduce a shared email foundation in `packages/platform/src/services/communication/email-delivery-templates/` for:
   - dark-mode tokens translated into email-safe inline styles,
   - shared header and footer chrome,
   - CTA or button rendering,
   - metadata rows, chips, and token or code panels,
   - plain-text section composition from the same structured content used for HTML.
3. Split template-specific content mapping from shared shell rendering:
   - family files (`billing`, `identity-session`, `notification-center`, `tenant-management`) keep the typed input mapping,
   - shared helpers own repetitive layout and fallback text behavior.
4. Add a brand-aware composition step so the final email chrome can use the tenant-branding-resolved label and reply-to posture without pushing branding concerns into producer workflows.
5. Keep live producer services (`notification-center` and `admin-tenant-management`) on the same shared service path; do not introduce internal HTTP hops or template-specific delivery seams.
6. Prefer a small shared helper tree over expanding the current single `shared.ts` file into a catch-all.

## Template-by-template implementation map

| Template                                                      | Runtime use today                     | Implementation treatment                                                                                               | Guardrail                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `billing.invoice-ready`                                       | live                                  | Dominant invoice summary panel, one primary billing CTA, compact trusted metadata row                                  | Use only tenant label, recipient, invoice number, total due, due time, and invoice URL                                            |
| `billing.invoice-ready-digest`                                | live                                  | Count-driven digest header plus stacked invoice rows or cards                                                          | Stay within `../notification-center/digest-scheduling.md`; do not compute aggregate totals or overdue states from display strings |
| `tenant-management.membership-invitation`                     | live                                  | Access-handoff layout with tenant context, relation, expiry, token block, and auth-first CTA                           | Keep token visible here only                                                                                                      |
| `tenant-management.membership-invitation-reminder`            | live                                  | Pending-state variant of the same invitation family                                                                    | Never re-send the token                                                                                                           |
| `tenant-management.membership-invitation-expiry-notification` | live                                  | Expired-state variant with clear closure and next step                                                                 | Never imply the old invite still works                                                                                            |
| `identity-session.email-verification`                         | render-only; producer wiring deferred | Minimal security shell with one verification CTA and expiry guidance                                                   | No provider-only state, no phishing-like ambiguity                                                                                |
| `identity-session.password-reset`                             | render-only; producer wiring deferred | Minimal security shell with one reset CTA and ignore-if-not-you guidance                                               | No temporary passwords or extra recovery telemetry                                                                                |
| `identity-session.mfa-code`                                   | render-only; producer wiring deferred | Dominant code panel with obvious expiry                                                                                | No device, IP, or location sections in v1                                                                                         |
| `notification-center.welcome-campaign`                        | render-only; producer wiring deferred | Onboarding panel with checklist-style `nextSteps`, one primary action, one support path                                | No fake step status chips or implied current producer ownership                                                                   |
| `notification-center.newsletter`                              | render-only; producer wiring deferred | Editorial shell with issue header, first-highlight emphasis, remaining highlight stack, web-view and unsubscribe paths | No mandatory hero asset, hidden campaign metadata, or implied current producer ownership                                          |

## Implementation phases

### Phase 0 — normalize the governing decisions

1. Record the surface mapping, unsupported-field removals, and versioning rule in the implementation slice before code changes reinterpret the accepted designs.
2. Keep `billing.invoice-ready-digest` within the current digest-scheduling contract from `../notification-center/digest-scheduling.md` unless a richer aggregate-summary spec is accepted first.
3. Treat the operator or control-tower invitation concept as deferred follow-up work unless a separate operator invitation workflow is accepted.

### Phase 1 — build the shared email foundation

1. Create shared email-safe tokens and shell helpers.
2. Add shared HTML and plaintext composition helpers.
3. Introduce the brand-aware chrome composition boundary so tenant-branding can affect sender-facing chrome without leaking into callers.
4. Prepare reusable family variants for security, billing, invitation, onboarding, and editorial layouts.

### Phase 2 — implement the live invitation family

1. Rebuild initial invitation, reminder, and expiry-notification templates on the shared foundation.
2. Keep the current admin-tenant-management workflow outputs and queue behavior unchanged apart from the rendered body and version bump.
3. Add focused tests for pending, token-present, and expired-state rendering rules.

### Phase 3 — implement the live billing family

1. Rebuild `billing.invoice-ready` and `billing.invoice-ready-digest` on the shared foundation.
2. Keep immediate and digest notification-center orchestration behavior unchanged.
3. Ensure the digest remains highly scannable without requiring unsupported aggregate data.

### Phase 4 — implement the identity family

1. Rebuild email verification, password reset, and MFA code templates on the shared security shell.
2. Preserve the current typed contracts and validation constraints.
3. Make the MFA code the visual focal point while keeping the HTML and plaintext outputs aligned.

### Phase 5 — implement the engagement family

1. Rebuild welcome-campaign and newsletter templates on the shared foundation.
2. Map `nextSteps` to checklist content and map newsletter highlights to a lead-plus-list editorial structure.
3. Keep newsletter preference management explicit and keep welcome support routing limited to the existing `supportUrl`.

### Phase 6 — hardening and repository validation

1. Update template tests and the live producer integration tests that assert tracked template ids and queue behavior.
2. Update the implementation tracker evidence or wording only if the slice changes versioned template evidence materially.
3. Run `bun run format:check`, `bun run typecheck`, and `bun run test` once implementation is complete.

## Test strategy

1. Keep unit tests around every render contract for valid input, invalid input, and required copy.
2. Add structural assertions that the final HTML:
   - contains the expected CTA and metadata sections,
   - contains no `<script>` tags,
   - contains no Tailwind CDN remnants,
   - contains no placeholder `href="#"` links,
   - omits deferred mock-only fields such as MFA telemetry or operator audit ids.
3. Keep live workflow tests for:
   - invitation issue, reminder, and expiry delivery outcomes,
   - billing immediate sends,
   - billing digest sends.
4. Assert versioned tracking identifiers explicitly so template version bumps are intentional and reviewable.

## Todo map

1. `normalize-email-template-decisions` — Codify the workflow-backed surface mapping, render-only visual defaults, unsupported-field removals, digest-scheduling guardrails, and template versioning rules before implementation changes reinterpret the accepted designs.
2. `build-email-template-foundation` — Create the shared inline-safe template shell, family variants, text helpers, and brand-aware chrome composition boundary under `email-delivery-templates`.
3. `implement-invitation-family` — Rebuild invitation issue, reminder, and expiry-notification templates on the new foundation without changing workflow ownership or queue semantics.
4. `implement-billing-family` — Rebuild invoice-ready and invoice-ready-digest templates on the new foundation while preserving notification-center immediate and digest orchestration.
5. `implement-identity-family` — Rebuild verification, password-reset, and MFA templates on the neutral security shell and remove unsupported telemetry from the concepts.
6. `implement-engagement-family` — Rebuild welcome-campaign and newsletter templates on the shared foundation using only current schema-backed content.
7. `harden-email-template-validation` — Expand render and service tests, update template version evidence, and finish with repo-wide validation.

## Dependency notes

1. `build-email-template-foundation` depends on `normalize-email-template-decisions`.
2. Each family implementation depends on `build-email-template-foundation`.
3. `harden-email-template-validation` depends on all family work.
