# Admin App Implementation Plan

Status: planning

Last updated: 2026-05-13

## Outcome

Build the admin app as a real operator workspace over the existing shared backend services, not as a mock dashboard. The implemented app must:

1. Match the accepted design direction and design system closely enough to preserve the intended look and feel.
2. Remove mock-only noise, terminal-like terminology, filler controls, and provider placeholders that do not match the actual platform.
3. Reuse one shared UI foundation that works for admin-app, product-app, and public-web without forcing all three apps into the same visual shell.
4. Stay backend-first: every visible mutation, reveal, approval, export, and escalation path must map to a real backend capability or stay out of the UI.
5. Be fully responsive across desktop, tablet, and mobile through deliberate recomposition rather than desktop shrinkage.

## Proposed decisions pending approval

| Area                    | Decision                                                                      | Why                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary UI library      | **Radix UI primitives**                                                       | Headless, accessible, SSR-safe, React 19-safe, and flexible enough to match the accepted design without importing a generic enterprise look.      |
| Styling foundation      | **Tailwind CSS 4** + repo-owned CSS variables and component tokens            | Fastest path to ship the dense control-tower aesthetic while keeping a shared token system reusable across all apps.                              |
| Dense data tables       | **TanStack Table 8**                                                          | Best fit for admin-heavy filtering, row expansion, responsive column collapsing, and reusable table logic.                                        |
| Shared UI package       | Create **`packages/ui`**                                                      | Keeps primitives, tokens, and patterns shared across admin-app, product-app, and public-web instead of duplicating app-local component libraries. |
| App product name        | **Comvestec Operations**                                                      | Keeps the “operations control tower” feel without terminal/CLI wording.                                                                           |
| Repair screen name      | **Repair Operations**                                                         | Replaces “repair console” with calmer, more product-like language.                                                                                |
| Break-glass screen name | **Support Operations & Break-Glass Access**                                   | Keeps the canonical governance term while removing the mockup's terminal-like tone.                                                               |
| Default admin theme     | **Dark operations theme** from the accepted design system                     | Best match for the accepted design direction and dense operator workflows.                                                                        |
| Badge shape             | **4px rounded chips only**                                                    | Matches the design-system rule; pill badges do not ship.                                                                                          |
| Route state model       | **URL/search-param-driven filters, tabs, drawer state, and selected records** | Preserves deep linking, back/forward behavior, and operator reproducibility.                                                                      |

## UI library choice

### Selected foundation

Use **Radix UI primitives** as the shared UI library.

### Why this is the best fit

1. **Design fidelity without lock-in**  
   The accepted admin designs are specific, dense, and serious. Radix gives the accessibility and interaction layer without forcing a branded look that would fight the design system.

2. **Works across all three first-party apps**  
   Admin-app needs dense operational surfaces, product-app needs transactional app flows, and public-web needs lighter marketing or onboarding surfaces. Radix supports all three because it is a primitive layer rather than a pre-opinionated theme.

3. **Best match for the existing TanStack Start stack**  
   The repository already uses React 19 + TanStack Start. Radix fits SSR and modern React well and does not push the repo toward client-only patterns.

4. **Safer for long-term reuse**  
   We can build repo-owned wrappers once in `packages/ui` and keep behavior, tokens, and accessibility consistent everywhere.

5. **Pairs cleanly with the other planned choices**  
   Tailwind CSS 4 handles the visual system, and TanStack Table handles the table layer. Radix fills the primitive interaction layer that those tools do not cover.

### Explicit non-choice

The primary foundation will **not** be MUI, Ant Design, Chakra UI, or Mantine. Those libraries are useful, but for this repository they are the wrong default because they would either:

1. push the UI toward a generic dashboard look,
2. make it harder to preserve the accepted design language,
3. create too much visual coupling between admin-app and the lighter product/public surfaces, or
4. encourage shipping prebuilt components that do not map cleanly to the platform’s governance patterns.

### Implementation note

We should **not** use Radix Themes as the visual system. The correct pattern is:

1. Radix primitives for behavior and accessibility,
2. repo-owned wrappers in `packages/ui`,
3. Tailwind/CSS-variable tokens for visuals,
4. app-specific theme layers on top of the shared foundation.

## Current stack currency check

The table below covers the current admin-app-facing stack. No framework pivot is needed before implementation starts, but a repo-wide verification on 2026-05-12 confirmed that the broader stack still has pending Bun, shared-runtime, and service-image upgrades in addition to the app-facing gaps below.

| Package                           | Current in repo | Current stable checked on 2026-05-12 | Plan                                        |
| --------------------------------- | --------------- | ------------------------------------ | ------------------------------------------- |
| Bun                               | `1.3.13`        | `1.3.13`                             | Current.                                    |
| React                             | `19.2.6`        | `19.2.6`                             | Current.                                    |
| React DOM                         | `19.2.6`        | `19.2.6`                             | Current.                                    |
| `@tanstack/react-start`           | `1.167.65`      | `1.167.65`                           | Current.                                    |
| `@tanstack/react-router`          | `1.169.2`       | `1.169.2`                            | Current.                                    |
| `@tanstack/react-router-devtools` | `1.166.13`      | `1.166.13`                           | Current if devtools remain enabled locally. |
| Vite                              | `8.0.12`        | `8.0.12`                             | Current.                                    |
| `@vitejs/plugin-react`            | `6.0.1`         | `6.0.1`                              | Already current.                            |
| TypeScript                        | `6.0.3`         | `6.0.3`                              | Current.                                    |
| Vitest                            | `4.1.6`         | `4.1.6`                              | Current.                                    |
| `@vitest/browser-playwright`      | `4.1.6`         | `4.1.6`                              | Current.                                    |
| `@vitest/coverage-v8`             | `4.1.6`         | `4.1.6`                              | Current.                                    |
| Playwright                        | `1.60.0`        | `1.60.0`                             | Current.                                    |
| Tailwind CSS                      | not installed   | `4.3.0`                              | Add.                                        |
| Radix primitives                  | not installed   | current stable `1.1.x` primitives    | Add only the primitives we use.             |
| `@tanstack/react-table`           | not installed   | `8.21.3`                             | Add.                                        |

### Stack conclusion

The dependency-refresh gate is now closed for the app-facing stack and the broader repo-owned upgrade set recorded in `specs/01-platform/architecture/013-technology-stack.md`. Freeze these versions for the first admin-app delivery slice and only widen them through explicit follow-up refresh work.

### Full-stack currency rule

The 2026-05-13 refresh re-verified the broader technology catalog in `specs/01-platform/architecture/013-technology-stack.md` and moved the repo-owned pins and images that participate in local development, validation, or admin-app delivery onto the latest stable version within their selected product line, or the latest version inside the intentionally selected H3 and OpenMeter pre-release channels. Phase 0 no longer has an outstanding dependency-refresh blocker.

## Design normalization decisions

The mockups are directionally strong, but they contain naming, provider, and interaction inconsistencies. The implementation will use the following normalized rules.

### 1. Naming and language

| Mock language               | Implementation language                                      |
| --------------------------- | ------------------------------------------------------------ |
| `GOV_CORE_VX`               | `Comvestec Operations`                                       |
| `CONTROL_PLANE`             | `Comvestec Operations` or `Operations` in shell labels       |
| `Tenant Repair Console`     | `Repair Operations`                                          |
| `Support Ops / Break Glass` | `Support Operations & Break-Glass Access`                    |
| `Audit`                     | `Audit Log`                                                  |
| `Home`                      | `Operations Home`                                            |
| `ACTOR / ENV / CID`         | `Operator / Environment / Correlation ID`                    |
| `View Console`              | `Open`, `Inspect`, or `View details` depending on the action |
| `Terminal` nav item         | **Remove**                                                   |

### 2. Provider and domain vocabulary

Mock provider names must be replaced with the actual platform stack:

| Mock vocabulary                                    | Implementation vocabulary                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Auth0                                              | Keycloak                                                                                            |
| Stripe                                             | Polar                                                                                               |
| Consul                                             | `Declared default`, `Runtime override`, `Effective value`, or `Environment` depending on the source |
| generic “admin_01” or “Acme Corp” placeholder data | sanitized seeded platform fixtures that match the real platform vocabulary                          |

### 3. Visual rules that become canonical

1. Keep the accepted **dark, industrial control-tower aesthetic**.
2. Keep **Inter** for UI copy and **JetBrains Mono** for ids, keys, scopes, and machine-facing values because that is already the accepted design-system choice.
3. Use a **4px spacing grid** and **4px radius** as the baseline shape language.
4. Use **36px dense table rows** as the standard operational table density.
5. Use **one redaction pattern only**: 45-degree diagonal slate stripe, 4px on / 4px off, subdued opacity.
6. Use **tonal layering and borders**, not glow-heavy or playful decoration.
7. Do **not** ship pill badges, giant soft shadows, decorative blur orbs, or generic avatar photography.

### 4. Canonical status semantics

The design system mentions semantic intent, but the mockups drift. The implementation will use one status map across the entire admin app:

| Semantic meaning                                | Color family | Examples                                   |
| ----------------------------------------------- | ------------ | ------------------------------------------ |
| Neutral / applied / complete                    | Slate        | `Applied`, `Resolved`, `Current`           |
| Active / healthy                                | Emerald      | `Active`, `Healthy`                        |
| Pending / scheduled / verifying                 | Amber        | `Pending review`, `Scheduled`, `Verifying` |
| Drift / mismatch / deprecated-but-still-present | Violet       | `Drifted`, `Needs sync`, `Deprecated`      |
| Error / blocked / expired / denied              | Crimson      | `Blocked`, `Error`, `Expired`, `Denied`    |

### 5. Mock-only UI that will not ship

These elements are explicitly excluded unless a real backend-backed route appears in scope:

1. `Terminal` navigation item.
2. Generic `Quick Repair` action.
3. Generic `Export Report` button on the home screen.
4. Decorative settings / notifications / profile chrome with no implemented surface behind it.
5. Placeholder avatar photography.
6. Any `href="#"` navigation stub.
7. Any action whose outcome cannot be described in backend terms, audited, and tested.

## Shell decisions

### Global shell

The admin app will use one persistent routed shell:

1. Left navigation rail.
2. Fixed top context header.
3. Scrollable content area.
4. Screen-level filter/action bar.
5. Optional detail drawer or stacked detail pane depending on viewport size.

### Sidebar behavior

1. Desktop defaults to the full sidebar with labels.
2. Tablet or other tight-width shells collapse the sidebar to an icons-only rail when space is constrained.
3. The collapsed rail still exposes labels and critical context through hover/focus disclosure.
4. Mobile removes the persistent rail entirely and uses a hamburger-triggered navigation drawer.
5. Sidebar mode is owned by the shared shell, not reimplemented per screen.

### Context header

The top bar must consistently show:

1. current operator identity,
2. current environment,
3. correlation id when the route is request-bound,
4. current tenant context when a tenant-specific screen is active.

Use bordered context chips rather than free-floating inline text. This is the one pattern across every screen.

### Navigation model

Initial admin navigation:

1. Operations Home
2. Repair Operations
3. Tenant Workspace
4. Runtime Config
5. Feature Flags
6. Permissions & Projection Profiles
7. Audit Log
8. Support Operations
9. Branding & Domains
10. Billing & Entitlements
11. Compliance & Retention
12. Webhooks & API Access

The following do **not** go into first navigation:

1. Terminal
2. Diagnostics, unless a real operator-ready diagnostics route is implemented
3. Saved views as a platform feature, until a real preference persistence surface exists

## Screen-by-screen implementation plan

Many screens below map to validated backend surfaces, but the admin app still needs targeted app-layer aggregation, capability, and projection work in addition to shell composition, first-party route wiring, and responsive UI.

| Screen                                  | Final route                         | Backend readiness                                                     | Keep from the design                                                                                | Adjust or remove                                                                                              |
| --------------------------------------- | ----------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Operations Home                         | `/`                                 | **validated backend inputs + new app aggregation**                    | posture cards, active queues, recent audit activity, deep links into workflows                      | no vanity analytics, no fake export button, no quick-repair shortcut                                          |
| Repair Operations                       | `/repair-operations`                | **validated** via admin billing + workflow-jobs surfaces              | list/detail workspace, replay/cancel, inspection reason gating, workflow state chips                | rename from console; no raw sensitive failure detail before reveal flow                                       |
| Tenant Workspace                        | `/tenants/$tenantId`                | **validated backend slices + new app aggregation**                    | tenant overview, memberships, invitations, billing posture, branding, recent audit                  | remove `Suspend` and `Terminate` until those flows exist in the backend                                       |
| Runtime Config                          | `/governance/runtime-config`        | **validated** via admin-governance                                    | dense table, diff view, proposal review, effective value visibility                                 | replace mock `Consul`/generic sources with actual runtime-source vocabulary                                   |
| Feature Flags                           | `/governance/feature-flags`         | **validated** via admin-governance                                    | lifecycle metadata, dependency visibility, rollout state, billable cues                             | no generic toggle-only UI; every change path uses real governance flows                                       |
| Permissions & Projection Profiles       | `/governance/access-control`        | **validated authorization base + targeted operator review expansion** | derive the screen from the same list/detail governance patterns as runtime config and feature flags | requires tuple review/revocation and projection-profile admin surfaces before shipment                        |
| Audit Log                               | `/governance/audit-log`             | **validated**                                                         | filters, immutable event inspection, export entry point                                             | no noisy decorative timeline-only view when table/filtering is the real workflow                              |
| Support Operations & Break-Glass Access | `/support-operations`               | **validated core slice + targeted contract expansion**                | support cases, tenant health, break-glass review, impersonation visibility                          | keep support-safe vs elevated zones explicit; reviewer/expiry detail may require backend projection expansion |
| Branding & Domains                      | `/branding`                         | **validated**                                                         | managed assets, sender identity metadata, custom domains, preview, lifecycle states                 | use real Keycloak/Polar/tenant branding vocabulary; no decorative preview-only controls                       |
| Billing & Entitlements                  | `/billing`                          | **validated**                                                         | plan, usage, repair gaps, invoice history, reconciliation posture                                   | no unsafe finance shortcuts; every action must align with existing admin-billing services                     |
| Compliance & Retention                  | `/compliance-retention`             | **validated**                                                         | retention policy controls, legal holds, evidence posture, guard visibility                          | no destructive affordance without explicit guarded review flow                                                |
| Webhooks & API Access                   | `/integrations/webhooks-api-access` | **validated core foundation**                                         | API key lifecycle, subscription status, current foundation delivery state                           | full operator-facing delivery-log inspection stays deferred until backend scope expands                       |

### Additional screen-level decisions

1. **Operations Home**  
   This becomes the root route. It is not a metrics dashboard. It is an operator posture screen that aggregates validated domain surfaces and links to the real workflows.

2. **Repair Operations**  
   The current `/` tenant-repair scaffold moves here. It remains the first implemented deep workflow because it already exists and anchors the admin direction.

3. **Tenant Workspace**  
   This is a composition screen, not a new domain. It should reuse validated tenant management, billing, branding, audit, and support-safe projections instead of creating an app-local read model disconnected from the shared services.

4. **Notification center and email delivery**  
   These backend slices are validated, but they are **not** part of the current visual scope. They can appear later as:
   - operations-home activity cards,
   - secondary communication screens,
   - or operator drill-down routes after the first admin shell lands.

5. **Permissions & Projection Profiles**  
   This capability is required by the admin-app spec even though it is not part of the current mock screen set. It should reuse the same control-tower language and governance patterns as Runtime Config and Feature Flags, and it must not ship until the operator review/revocation and projection-profile backend surfaces are explicit.

## Backend prerequisites and concept gaps

The admin app is not waiting on a broad backend rewrite, but several concepts must stay explicit so the frontend does not outrun the platform contracts.

| Concept                                                | Why the admin app needs it                                                                                                                 | Current state                                                                                                                              | What must happen before or while UI lands                                                                                                   | Required validation and docs                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Operations Home summary contract                       | The root route needs posture counts, queues, alerts, and recent activity without stitching raw domain payloads in the client.              | Landed as an app-safe aggregate helper over validated services and is already wired into the current root route.                           | Use the landed summary surface as the dedicated Operations Home route contract instead of rebuilding the composition in UI components.      | `tests/platform`, admin browser coverage for the home route, and Playwright coverage once stable.                          |
| Tenant Workspace aggregate projection                  | The tenant cockpit needs one tenant-scoped view across tenant management, billing, branding, audit, and support-safe data.                 | Landed as a tenant-scoped aggregate helper over validated services.                                                                        | Build the tenant route on the landed projection/helper rather than composing many unrelated payloads in the route component.                | `tests/platform`, backend-e2e where transport changes, and admin browser coverage for the tenant route.                    |
| Operator capability snapshot                           | Navigation, screen entry, and action visibility must follow real permissions and entitlements rather than hardcoded UI checks.             | Landed as a backend-backed capability snapshot/helper keyed to the trusted session and shared route vocabulary.                            | Reuse the landed capability snapshot in navigation and route guards so the app stays aligned with real backend authorization.               | `tests/platform` for authorization mapping plus browser coverage for hidden/denied states.                                 |
| Access-control and projection-profile operator surface | The admin app is expected to manage permissions and projection profiles, which needs more than read-only authorization checks.             | Landed for exact-scope tuple review/revocation plus declared projection-profile listing.                                                   | Build the management screens on the landed operator surfaces and only widen the backend when a route needs new, justified scope.            | Access/domain tests, `tests/platform`, backend-e2e if transport changes, plus browser coverage when the route lands.       |
| Governed reason catalogs and action policy metadata    | Reveal dialogs, approval drawers, rejection flows, and high-risk actions need governed reason options and policy hints.                    | Landed as shared admin contracts plus backend-owned action-policy metadata.                                                                | UI flows should consume the returned metadata directly instead of inventing local dropdowns or risk hints.                                  | Contract/service tests, backend-e2e where flows cross transport boundaries, and browser coverage once the route uses them. |
| Server-driven list query envelopes                     | Dense screens need typed filters, sort, pagination, export, and row-detail lookup without oversharing data or relying on client filtering. | Landed for the current admin control-plane slice and should expand per screen instead of via generic client filtering.                     | Reuse the landed typed query envelopes and extend them screen-by-screen as each dense route is added.                                       | `tests/platform`, backend-e2e for list/export transport, and browser URL-state/filter tests.                               |
| Support-safe break-glass detail projection             | The final support screen needs richer incident detail than the current core slice exposes.                                                 | Landed for support-safe approval and expiry context (`approvedBy`, `reason`, `expiresAt`); reviewer metadata is still not durably modeled. | Use the landed detail projection for the richer pane and add separate persisted reviewer metadata only if a future backend slice models it. | Support-operations service tests, backend-e2e, and doc/tracker updates.                                                    |
| Operator-facing webhook delivery inspection            | The mock designs imply richer delivery visibility than the current validated foundation guarantees.                                        | Not part of the current validated operator foundation.                                                                                     | Keep the screen on API key/subscription lifecycle first; only add richer delivery inspection after a dedicated backend requirement lands.   | Webhooks API access service tests, backend-e2e if the transport expands, and doc/tracker updates.                          |
| Optional step-up auth policy                           | Secret reveals or high-risk actions may require re-auth or MFA depending on security policy.                                               | Still not a current backend requirement; the new action-policy metadata explicitly keeps `stepUpRequired` false.                           | Only add if security requires it, but when added the challenge state and audit trail must be backend-owned.                                 | Access/security tests first, then browser and Playwright coverage once the UI depends on it.                               |

### Concepts intentionally deferred until backend support exists

These ideas stay out of the first admin implementation unless a backend slice is accepted and landed first:

1. Batch replay or batch cancellation from Repair Operations.
2. Manual break-glass release or revoke controls.
3. Tenant suspend or terminate actions.
4. Cross-device saved-view persistence.
5. A global command palette or diagnostics route.
6. Dedicated Notification Center or Email Delivery first-party screens beyond Operations Home signals.

### Rule for adding backend concepts during planning

If a concept is promoted from “needed” to “must implement now”, the work order is:

1. add or update the governing spec or manifest first,
2. land the backend contracts, services, and tests,
3. update the implementation plan, tracker, and any related contracts docs,
4. update `.env.example`, operator docs/runbooks, and any required ADRs when runtime or architecture/security boundaries change,
5. only then wire the admin route to the new concept.

## Required non-mock interaction patterns

These flows are not fully designed in the mockups, but they must exist in implementation.

### Redaction reveal

Every regulated-sensitive or secret-bearing surface must use one reveal pattern:

1. operator chooses reveal,
2. operator supplies reason,
3. optional explanatory comment is captured when the backend contract requires it,
4. backend decides whether the field can be revealed,
5. reveal is audit-logged,
6. revealed content never bypasses field-security rules.

### High-risk action guard

Every destructive or high-risk action uses one confirmation pattern:

1. summary of the target,
2. explicit reason capture,
3. required comment where policy requires it,
4. approval submission if the action is review-gated,
5. direct execution only when the backend surface already supports it safely.

### Approval state machine

Use this baseline state model wherever approval-backed governance applies:

`Draft -> Pending review -> Approved -> Applied`

Alternative exits:

1. `Draft -> Cancelled`
2. `Pending review -> Rejected`
3. `Pending review -> Superseded`
4. `Approved -> Failed to apply` when execution fails after approval

### Break-glass access state machine

Represent elevated support access as separate backend-grounded models:

1. **Impersonation or active elevated-session lifecycle**
   - `Active -> Revocation pending -> Revoked`
   - `Expired` is shown when the session ages out instead of being revoked.
2. **Durable break-glass incident review state**
   - `Pending review -> Reviewed`

The current support-safe projection does not yet expose every reviewer or expiry field needed for the full target screen, so those fields are an explicit backend aggregation/contract-expansion prerequisite for the final break-glass detail experience. Manual release should stay out of the baseline UI flow until the backend contract supports it explicitly.

### Session and access states

The app must have first-class UI for:

1. missing session,
2. stale session,
3. permission denied,
4. tenant not found,
5. empty result,
6. backend error,
7. successful mutation with authoritative refresh.

## Component inventory for `packages/ui`

The shared UI package should be created from day one with clear folders rather than a flat pile of components.

### Proposed package shape

1. `packages/ui/src/tokens/`
2. `packages/ui/src/primitives/`
3. `packages/ui/src/patterns/`
4. `packages/ui/src/patterns/admin/`
5. `packages/ui/src/runtime/`
6. `packages/ui/src/utils/`

### Shared primitives

1. `Button`
2. `Input`
3. `Select`
4. `Checkbox`
5. `RadioGroup`
6. `Textarea`
7. `Dialog`
8. `Popover`
9. `Tooltip`
10. `Tabs`
11. `DropdownMenu`
12. `Sheet`
13. `ScrollArea`
14. `Separator`
15. `Toast`
16. `Badge`

### Shared patterns

1. `AppShell`
2. `SideNav`
3. `ContextHeader`
4. `ScreenHeader`
5. `StickyFilterBar`
6. `DenseDataTable`
7. `ListDetailWorkspace`
8. `DetailDrawer`
9. `StatusChip`
10. `AuditTimeline`
11. `DiffViewer`
12. `RedactedField`
13. `InspectionReasonDialog`
14. `HighRiskActionDialog`
15. `EmptyState`
16. `ErrorState`
17. `PermissionDeniedState`
18. `LoadingState`
19. `ResponsiveSidebar`
20. `MobileNavDrawer`

### Cross-app sharing rule

`packages/ui` should expose:

1. generic primitives usable everywhere,
2. shared design tokens usable everywhere,
3. admin-specific patterns that remain clearly admin-owned.

Product-app and public-web should reuse the foundation without inheriting the admin shell.

## App architecture rules

### Route ownership

Each screen route stays thin and uses TanStack Start loaders/server functions as the framework edge only.

### Data access

All admin routes call root-safe first-party helpers in `packages/platform/src/services/apps/` and those helpers delegate to the existing validated shared services. The app must **not** call internal backend-owned HTTP handlers just because a similar HTTP route exists.

### State rules

1. Route data is owned by route loaders and server functions.
2. Filter state, selected records, active tabs, and drawer state live in the URL.
3. Avoid a broad client-side store for cross-screen data.
4. Use optimistic UI only when the backend already returns authoritative final state safely.

### Global device model

1. Add one shared device-classification runtime in `packages/ui/src/runtime/`.
2. Expose a global provider and hooks such as `DeviceProvider`, `useDeviceType`, and `useResponsiveShell`.
3. Route and shell behavior branching uses this shared model instead of screen-local width listeners.
4. CSS media queries and container queries still handle pure presentation, but device-aware behavioral choices come from the shared runtime.
5. The shared model must cover at least `mobile`, `tablet`, `desktop`, plus shell modes for `sidebar-expanded`, `sidebar-collapsed`, and `nav-drawer`.

### New app helper work expected

The following app-layer helpers are now partly landed and define the expected app-safe boundary:

1. operations-home aggregation helper
2. tenant-workspace aggregation helper
3. first-party governance route helpers for runtime config, feature flags, and audit
4. first-party access-control and projection-profile route helpers once the backend operator surface is explicit
5. first-party support, branding, billing, retention, and webhooks admin helpers where an app-safe entrypoint does not already exist
6. current-operator capability snapshot helper
7. governed action-policy and reason-catalog helper surfaces where the existing backend slices do not already return them
8. shared device-model and responsive-shell runtime wiring in `packages/ui`

## Responsive plan

The desktop mockups are the source of truth for content, not for layout behavior. Tablet and mobile must be designed intentionally.

### Desktop

1. Full side rail.
2. List/detail and triple-pane layouts where appropriate.
3. Full filter bar and dense tabular views.

### Tablet

1. Sidebar collapses to an icons-only rail when space is tight.
2. Tables keep their highest-value columns visible.
3. Detail panels may stack below the list instead of pushing right.
4. Filter bars may collapse secondary filters into sheets or popovers.
5. Sidebar labels and additional context appear through hover/focus disclosure instead of a full rail by default.

### Mobile

1. Navigation becomes a hamburger-triggered drawer.
2. Split views become one-column flows with full-screen sheets for detail.
3. Dense tables become card lists with labeled key/value rows.
4. Row actions move into explicit action menus or card footers.
5. Context chips remain visible or one tap away at all times.
6. Horizontal-scroll-only tables are not acceptable.

## Accessibility and interaction rules

1. Keyboard access for all dialogs, drawers, menus, tabs, and tables.
2. Visible focus states everywhere.
3. Minimum 44px touch targets on mobile.
4. WCAG AA contrast for all semantic states.
5. Reduced-motion-safe transitions.
6. ARIA live announcements for destructive or high-signal status updates.
7. Reveal flows and approval flows must be screen-reader complete, not icon-only.

## Implementation phases

### Phase 0 — dependency refresh and UI foundation

1. Freeze the refreshed admin-app-facing packages above and the broader repo-owned baseline in `013-technology-stack.md` as the starting point for the first admin delivery slice.
2. Add Tailwind CSS 4, Radix primitives, and TanStack Table.
3. Create `packages/ui` with tokens, primitives, admin patterns, and the shared device runtime.
4. Replace the current plain-CSS-only direction in admin-app with the shared UI foundation.

### Phase 1 — admin shell and route restructuring

1. Introduce the persistent admin shell.
2. Move the current tenant-repair route from `/` to `/repair-operations`.
3. Make `/` the new Operations Home.
4. Normalize navigation, naming, context chips, and sidebar collapse behavior.
5. Wire the global device model so the shell can switch between full rail, collapsed icon rail, and mobile drawer without duplicating breakpoint logic.
6. Add missing stale-session, missing-session, denied, and empty-state shells using the new patterns.

### Phase 2 — governance screens

1. Runtime Config
2. Feature Flags
3. Permissions & Projection Profiles
4. Audit Log

This phase should land early because Runtime Config, Feature Flags, and Audit Log are already validated backend-backed governance surfaces that define the platform's credibility. Permissions & Projection Profiles belongs in the same governance wave, but it stays gated on the targeted operator-surface expansion called out earlier in this plan.

### Phase 3 — domain operator screens

1. Tenant Workspace
2. Branding & Domains
3. Billing & Entitlements

These are composition-heavy screens built on already-validated domain services.

### Phase 4 — compliance and support screens

1. Support Operations & Break-Glass Access
2. Compliance & Retention
3. Webhooks & API Access

These flows are real and largely backend-ready, but their UI needs stronger safety treatments and explicit role boundaries. Support Operations also has a targeted backend projection gap for the final break-glass detail experience, so that screen is implemented against the validated core slice first and expanded once the richer support-safe projection lands.

### Phase 5 — responsive hardening and end-to-end validation

1. Tablet and mobile recomposition pass across every screen.
2. Browser-level interaction coverage for admin-app patterns.
3. Playwright e2e journeys for the first stable workflows.
4. Final accessibility, focus, and interaction hardening.

## Test strategy

The repository already has the right validation layers; the missing work is turning the admin-app and Playwright scaffolds into real coverage.

| Layer                                      | Where                                      | Purpose                                                                                                                          |
| ------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Shared service and first-party route tests | `tests/platform/**/*.test.ts`              | Validate loaders, server functions, request-context resolution, projection behavior, and mutation safety.                        |
| Browser/component tests                    | `apps/admin-app/src/**/*.browser.test.tsx` | Validate shell rendering, responsive composition, filter bars, drawers, dialogs, redaction reveal flow, and denied/empty states. |
| Backend end-to-end tests                   | `tests/platform/backend-e2e/**/*.test.ts`  | Keep trusted-session, authorization, and backend mutation flows honest as the app starts consuming them.                         |
| Playwright e2e tests                       | `packages/e2e/tests/**/*.spec.ts`          | Validate actual admin-user journeys through the first-party app shell in a real browser.                                         |

If a new backend prerequisite is added before or during admin-app delivery, it must land with backend tests and updated docs first, then gain browser and Playwright coverage once the route depends on it.

### Must-have admin browser coverage

1. shell navigation and active-route state,
2. operations-home posture rendering,
3. repair-operations reveal gating and mutation affordances,
4. runtime-config list/detail workflow,
5. feature-flag lifecycle rendering,
6. permissions/projection-profile route rendering once the backend operator surface lands,
7. audit-log filter state in URL,
8. mobile nav drawer and mobile list-detail conversion,
9. permission-denied and stale-session states.

### Must-have Playwright journeys

Replace the skipped `packages/e2e/tests/foundation-smoke.spec.ts` scaffold with real admin journeys:

1. stale or missing session handling,
2. repair-operations inspection reason + replay/cancel flow,
3. runtime-config proposal review flow,
4. audit-log query + export flow,
5. legal-hold place/release flow,
6. API key rotate/revoke flow,
7. tenant-branding asset/domain flow once the first route is stable.

### Required completion gate

Each implementation slice should use narrow validation while in progress, but no slice is complete until the repo-wide validation gate passes:

1. `bun run format:check`
2. `bun run typecheck`
3. `bun run test`

## Explicit guardrails

1. No UI-only authorization.
2. No internal HTTP hops from first-party app routes to backend-owned handlers.
3. No placeholder buttons.
4. No provider placeholders that contradict the actual stack.
5. No separate one-off UI system inside admin-app after `packages/ui` exists.
6. No broad client-state store introduced just to coordinate tables, filters, and drawers.
7. No shipping of settings, notifications, or diagnostics shells until they have real backed functionality.

## Approval gate

Approval is requested for the following implementation choices:

1. **Radix UI primitives** as the shared UI library,
2. **Tailwind CSS 4** as the styling layer,
3. **TanStack Table 8** for dense operational tables,
4. **`packages/ui`** as the shared internal design-system package,
5. **Comvestec Operations** as the non-terminal admin app name,
6. **Repair Operations** and **Support Operations & Break-Glass Access** as the normalized route names.
