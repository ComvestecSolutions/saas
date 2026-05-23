# Admin App Implementation Plan

Status: accepted

Last updated: 2026-05-19

This plan supersedes the previous admin implementation plan. It
covers the full redesign on the **Operator Desk** shell with the new
`admin-organization` membership module. Treat this file as the
delivery contract; the per-screen design intent lives here, the
shell decision lives in ADR-022, and the admin-org module decision
lives in ADR-023.

This update reaffirms the redesign as a **full product reset**. The
accepted shell and admin-organization decisions still stand, but the
current implementation is still a hybrid of legacy page-per-route
surfaces and partial Desk surfaces, so every existing admin-app screen
— including sign-in, universal state screens, and transitional legacy
routes — remains redesign scope until the final cutover lands.

The owner has approved the Operator Desk concept and locked the
following choices (the previously open §16 questions):

1. **Admin organization** is a separate `admin-organization` module
   (not reused inside `tenant-management`).
2. **Polar refunds** are deep-link only from the admin app; no
   refund mutation surface ships in v1.
3. **Workspaces** are per-user first; cross-org sharing is a
   follow-up after the v1 implementation lands.
4. **Dark theme only** for v1. Light theme is a follow-up.
5. The Operator Desk concept is approved.
6. The **Signal Deck** design direction is approved: matte data planes,
   restrained liquid-glass command surfaces, dense operator-first
   information design, and no stock admin-template shell patterns.

## 0. Current-state failures this plan corrects

The existing admin app still has several unacceptable operator
experience failures that this plan explicitly corrects:

1. The shell is split between a legacy `AdminShell` and a partial
   Operator Desk takeover, forcing two mental models into one product.
2. Some workflows still require manual machine-facing inputs such as a
   bearer token from the current Keycloak session or free-text scope
   identifiers.
3. `/desk` and `/r/$` still expose placeholder states instead of real
   operator-grade mission-control surfaces.
4. Several mutation-heavy admin surfaces remain thin shells with
   limited confirmation and post-action guidance instead of complete
   operator workflows.
5. The current home/dashboard experience does not yet function as the
   live SaaS-foundation control tower this app is meant to be.
6. The visual system still carries older control-tower styling that is
   too generic for the final product and is not yet consistently
   applied across the route tree.

## 1. Outcome

Rebuild the admin app from a blank UI canvas on top of the existing
backend (extended where called out in §9). After this plan:

1. Operators never paste tokens or ids.
2. The shell is the Operator Desk (ADR-022) at every breakpoint.
3. Every backend capability already shipped has a real, governed
   first-party admin surface, plus the 16 new backend additions in
   §9 land and have first-party surfaces too.
4. Tables, log explorers, diffs, reveal flows, and approval drawers
   use the shared `packages/ui` v2 patterns — never one-off shapes.
5. Tests cover everything per §10 (`tests/platform`, browser tests
   in `apps/admin-app/src/**/*.browser.test.tsx`, backend-e2e,
   Playwright e2e, visual regression, axe a11y).
6. `bun run format:check`, `bun run typecheck`, `bun run test`,
   `bun run test:e2e`, `bun run test:visual`, and `bun run test:a11y`
   all stay green.
7. Every existing screen, including sign-in and every universal state,
   is visually and structurally redesigned; no legacy admin surface
   survives as a visual exception after cutover.
8. The app homepage becomes a true mission-control surface with useful
   posture, revenue, risk, queue, and vendor intelligence rather than
   a vanity dashboard or nav recap.

## 2. Design language / stack

- **Tailwind CSS 4** as styling layer.
- **Radix UI primitives** as headless behavioural layer.
- **TanStack Table 8** for dense tables.
- **`packages/ui`** shared internal design system (tokens →
  primitives → patterns → admin patterns → runtime helpers).
- **TanStack Start + TanStack Router** unchanged.
- **Effect + Effect Schema** for all first-party app helpers
  (route loaders / server functions).
- **Signal Deck** visual direction: matte data planes for dense
  operational content, restrained liquid-glass command surfaces for
  the shell and transient overlays, and no template dashboard tropes.
- **Typography**: `IBM Plex Sans Condensed` for command headers and
  dense labels, `IBM Plex Sans` for body copy, `JetBrains Mono` for
  identifiers, metrics, timings, and audit metadata.
- **No third-depth nesting** (matte canvas + glass — two layers
  only).

## 3. Operator Desk shell

See ADR-022 for the full decision. Summary:

- **Pulse Ribbon** (top, 32px) — live colour-coded segments per
  domain (slate / amber / violet / crimson); hover peek; click
  pins to workbench.
- **Left Edge Rail** (56px) — vertical dock of pinned resources
  (tenants, runs, incidents, drafts, flags, configs); not a nav
  menu.
- **Center Workbench** — 1–4 resource panes; split / stack /
  peek / pin; layout URL-encoded
  (`/desk?panes=tenant:abc|audit?actor=abc&t=24h|config:identity/session.idleMinutes`).
- **Right Context Spine** (320px, collapses to 56px) — actor,
  environment, tenant, correlation, capability, audit echo,
  vendor card.
- **Bottom Command Strip** (48px, liquid glass) — omnibar (scoped
  prefixes `t/ f/ c/ u/ inv/ d/ kc/ ev/`), workspace tabs,
  alerts pulse, run-as banner.

## 4. Information architecture: resource views

Old model: routes → pages. New model: URL describes a workbench
layout of resource views.

| Type                   | Resource path                         | Pane behaviour                                                             |
| ---------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| `tenant`               | `/r/tenant/<id>`                      | Tabbed: Overview · Members · Billing · Branding · Audit · Repair · Support |
| `tenant-list`          | `/r/tenants`                          | Dense data table v2 with facets / saved views                              |
| `runtime-config`       | `/r/config/<moduleId>/<key>[?scope=]` | Diff / proposal / approval drawer / history                                |
| `feature-flag`         | `/r/flag/<key>[?scope=]`              | Lifecycle / rollout / dependencies / audit                                 |
| `audit-event`          | `/r/audit/<eventId>`                  | Event detail with correlation graph                                        |
| `audit-query`          | `/r/audit?…filters`                   | Stream-style log explorer + facets + live tail                             |
| `support-incident`     | `/r/incident/<id>`                    | Break-glass review, reviewer, expiry, timeline                             |
| `webhook-subscription` | `/r/webhook/<id>`                     | Subscription + recent deliveries + replay                                  |
| `webhook-delivery`     | `/r/delivery/<id>`                    | Headers/body, retry, signature inspector, audit echo                       |
| `api-key`              | `/r/api-key/<id>`                     | Rotate/revoke, scopes, usage; reveal flow                                  |
| `billing-account`      | `/r/billing/<tenantId>`               | Plan, entitlements, usage, invoices, reconciliation                        |
| `invoice`              | `/r/invoice/<id>`                     | Lines, payment state, deep-link to Polar                                   |
| `meter`                | `/r/meter/<id>`                       | OpenMeter usage chart, anomalies                                           |
| `legal-hold`           | `/r/legal-hold/<id>`                  | Hold placement / release / evidence                                        |
| `retention-policy`     | `/r/retention/<dataType>`             | Policy, guards, purges scheduled                                           |
| `domain`               | `/r/domain/<hostname>`                | Custom-domain lifecycle, DNS, verification                                 |
| `branding-asset`       | `/r/branding/<tenantId>`              | Logo / theme / sender, preview                                             |
| `keycloak-user`        | `/r/kc-user/<id>`                     | Roles, sessions, MFA, deep-link to Keycloak                                |
| `kc-realm-role`        | `/r/kc-role/<id>`                     | Membership, audit                                                          |
| `operator`             | `/r/operator/<id>`                    | Staffing profile, capabilities, recent actions                             |
| `admin-membership`     | `/r/admin-member/<id>`                | Internal admin-org membership                                              |
| `notification`         | `/r/notify/<id>`                      | Novu delivery state                                                        |
| `vendor-health`        | `/r/vendor/<service>`                 | One service's health, latency, version, deep-link                          |
| `workflow-run`         | `/r/run/<id>`                         | Workflow-jobs run with replay/cancel                                       |

Top-level routes:

```
/                 -> /desk (or /sign-in)
/sign-in          governed OIDC handoff (new canonical entry; visual redesign)
/auth/sign-in     compatibility alias during cutover; same visual surface
/auth/*           OIDC callback / start / logout (kept; behaviour unchanged)
/desk             shell + workbench
/r/*              resource view loaders
/admin/*          internal admin-org settings (members, workspaces, tokens, profile, audit)
```

## 5. Auto-context system

- Bearer tokens are server-resolved by `identity-session`. The UI
  **never** shows or asks for one.
- Every id input is a `Picker` powered by the omnibar search
  service; the id is hidden, copyable from a hover affordance.
- Active correlation id is generated by shared middleware (already
  in repo) and shown in the right Context Spine.
- Run-as banner appears whenever a session-bound break-glass grant
  is active; release is one click + reason capture (requires the
  manual break-glass release endpoint — §9 item 5).

## 6. Admin organization (ADR-023 summary)

`admin-organization` module owns:

- `admin_members` (admin user ↔ role mapping)
- `admin_member_invitations` (Novu-emailed governed invites)
- `admin_audit_log` (admin-org-scoped subset alongside the central
  audit log)
- Capability join: `admin-org role → platform actor capabilities`.

Bootstrap owner is created by the existing operator-bootstrap
script. Subsequent members are invited from `/admin/members` by
any `admin-owner` or `admin-admin`. All membership changes are
audited.

## 7. Cross-cutting UI patterns (the `packages/ui` v2 inventory)

### Tokens

`packages/ui/src/tokens/` — colour, spacing (`2, 4, 6, 8, 10`),
typography (`IBM Plex Sans Condensed` / `IBM Plex Sans` /
`JetBrains Mono`), shape (`4 / 8 / 10` radius),
motion (`60 / 120 / 180 ms`), liquid-glass variables
(`--glass-bg`, `--glass-blur`, `--glass-border`,
`--glass-highlight`, `--glass-shadow`, `--glass-tint-domain`).

### Primitives (Radix-backed)

`Button`, `Input`, `Select`, `Checkbox`, `RadioGroup`, `Textarea`,
`Dialog`, `Popover`, `Tooltip`, `Tabs`, `DropdownMenu`, `Sheet`,
`ScrollArea`, `Separator`, `Toast`, `Badge` (4px chips only).

### Desk shell patterns

`AppDesk`, `PulseRibbon`, `EdgeRail`, `Workbench`, `Pane`,
`ContextSpine`, `CommandStrip`, `Omnibar`, `WorkspaceTabs`,
`AlertsPulse`, `RunAsBanner`, `ResponsiveDesk` (device-runtime
backed; tablet + mobile recompositions).

### Data & governance patterns

`DenseDataTable` (TanStack Table 8 with faceted filters, saved
views, column manager, density modes, bulk action bar, peek and
open-as-pane, keyboard map, export), `LogStream` (live tail,
facets, correlation graph), `DiffApprovalDrawer` (4-way diff +
governed reason + lifecycle timeline), `RevealField` (45° stripe
redaction + reason dialog + audit echo), `HighRiskActionGuard`,
`Picker` (omnibar-backed id picker), `VendorCard`, `KpiTileV2`,
`StatusChip`, `StateScreen` (empty / loading / denied / stale /
404 / 5xx — one component all routes share).

### Runtime helpers

`packages/ui/src/runtime/` — `DeviceProvider`, `useDeviceType`,
`useResponsiveDesk`, `useOmnibar`, `useWorkbenchUrlState`,
`useCapability` (capability-snapshot v2 hook).

## 8. Screen-by-screen plan

> Each screen is a workbench layout / resource view. URL state
> drives every layout choice for deep linking.

### 8.1 Sign-in (`/sign-in`, `/auth/sign-in`)

Full-screen entry into the Signal Deck language. One primary CTA
"Continue with identity provider". No local credential UI. The surface
must feel premium and operator-grade without becoming decorative. Use
the same spacing, typography, and shell vocabulary cues as the rest of
the redesign. Auth behavior stays unchanged, but the current sign-in
screen does **not** survive visually.

### 8.2 Operations Home (`/desk`)

Default workbench on sign-in:

- **Pane 1 (60%)** — Posture board: 12 KPI tiles driving the
  pulse ribbon (drifted configs, pending proposals, failing
  webhook deliveries, open break-glass incidents, billing
  reconciliation gaps, retention purges scheduled, audit spikes
  24h, stale workflow runs, errored vendor healthchecks,
  expiring custom domains, pending invitations, unmapped admin
  members); 24h live posture chart for the worst-current
  domain.
- **Pane 2 (40%)** — Operator queue: My approvals · Recent
  activity · Alerts · Pinned. Each item opens as its own pane.

Backend: §9 item 3 (Ops Home aggregate v2).

### 8.3 Tenant list (`/r/tenants`)

DenseDataTable v2. Columns: name, slug, env, plan, status
chips, members, MRR, last activity, branding state, custom
domain, open incidents. Saved views: "All", "Prod", "Trial",
"Past due", "Drifted", "Open incidents". Bulk actions gated by
capability.

### 8.4 Tenant workspace (`/r/tenant/<id>`)

Tabs in one pane: **Overview · Members & Invitations · Billing ·
Branding · Audit · Repair · Support · Danger Zone**. Danger
Zone surfaces are greyed with a backend-gap tooltip until
suspend/terminate land. Backend: §9 item 4.

### 8.5 Runtime Config (`/r/config[...]`)

List + 4-way diff detail + DiffApprovalDrawer. Edit form rendered
from schema type. Source / status / scope filters. Last-N change
history inline.

### 8.6 Feature Flags (`/r/flag[...]`)

List with lifecycle / dependencies / billable cue. Detail with
rollout state, dependency mini-graph, approval drawer. Backend:
§9 item — dependency-graph projection over Unleash.

### 8.7 Access Control (`/r/access`)

Tabs: **Operators (admin-org members + roles), Tuples (Ory Keto
inspector), Projection profiles, Scopes & permissions**.

### 8.8 Audit Log (`/r/audit`)

LogStream pattern with facets, time presets, live tail,
correlation graph (paired pane), per-event JSON inspector with
reveal flow, saved queries, audited exports.

### 8.9 Support Operations (`/r/support`, `/r/incident/<id>`)

Cases list, active break-glass grants, expiring soon. Incident
detail: timeline, approval state, reviewer, expiry, audit echo,
release-grant cta. Backend: §9 items 5 + 14.

### 8.10 Branding & Domains (`/r/branding[...]`, `/r/domain/<host>`)

Assets, theme tokens, sender identity, side-by-side preview
(default vs tenant via real public-web iframe). Domain lifecycle
chips, DNS records with copy, verify cta, activate behind
high-risk guard.

### 8.11 Billing & Entitlements (`/r/billing[...]`, `/r/invoice/<id>`, `/r/meter/<id>`)

Per-tenant + global revenue posture (MRR/ARR 6/12 months),
failed payments, reconciliation gaps, Polar webhook failures.
Invoice deep-links to Polar (no in-app refund per owner
decision). Meters show OpenMeter usage and anomalies. Backend:
§9 items 7 + 8.

### 8.12 Compliance & Retention (`/r/retention[...]`, `/r/legal-hold/<id>`)

Retention policies per data type with guards visible, scheduled
purges with countdown and pause/resume, legal hold place/release
with evidence capture.

### 8.13 Webhooks & API Access (`/r/webhook[...]`, `/r/api-key/<id>`)

Tabs: inbound · outbound · API keys. Delivery log explorer with
retry/replay, signature inspector, payload viewer with reveal.
API keys: rotate/revoke + secret reveal. Backend: §9 item 6.

### 8.14 Workflow Runs (`/r/runs`, `/r/run/<id>`)

List and detail with steps, payload, audit, replay, cancel.
Backend: §9 item 15.

### 8.15 Vendor Health (`/r/vendors`, `/r/vendor/<service>`)

Grid of all integrated services with status dot, version,
latency, last incident, deep-link. Per-vendor detail with
history and runbook. Backend: §9 items 9 + 10.

### 8.16 Notification Center (`/r/notify[...]`)

Outbound Novu deliveries, in-app inbox, filters, resend cta.
Backend: §9 item 16.

### 8.17 Search (`/r/search?q=`)

Global search results page (omnibar "see all" surface). Backend:
§9 item 11.

### 8.18 Admin org settings (`/admin/*`)

`/admin/members`, `/admin/workspaces`, `/admin/tokens` (owner
only), `/admin/profile`, `/admin/audit`. Backend: §9 items 1 + 2
for `/admin/members`, `/admin/workspaces`, `/admin/profile`,
`/admin/audit`; §9 item 17 (new — `admin-operator-test-tokens`
module, owner-only, governed by
[ADR-024](../../03-adr/identity/ADR-024-admin-operator-test-tokens.md)

- [module spec](../../02-modules/access/admin-operator-test-tokens/spec.md))
  for `/admin/tokens`.

### 8.19 Universal states

`StateScreen` covers empty / loading / denied / stale-session /
404 / 5xx with consistent recovery actions and correlation id.

## 9. Backend additions (in delivery order inside Phase 1)

1. **`admin-organization` module** (ADR-023): contracts, manifest,
   service, app helpers, HTTP adapter, persistence (Drizzle),
   invitations via Novu, reason catalog entries, tests.
2. **`admin-saved-views` + `admin-workspaces`** persistence and
   helpers.
3. **Operations Home aggregate v2**: 12 posture counters +
   per-domain sparkline series.
4. **Tenant workspace aggregate v2**: adds billing meters, current
   break-glass grant summary, repair-gap summary.
5. **Manual break-glass grant + release endpoints** with reviewer
   metadata persistence.
6. **Operator-facing webhook delivery envelope**: list, detail,
   replay, retry, signature inspector.
7. **Polar revenue projection** (read-only, admin-only).
8. **OpenMeter usage query** (admin-only).
9. **Vendor-health aggregator** unified across every adapter
   healthcheck schema.
10. **Per-vendor read helpers** (Keycloak users/roles/sessions,
    Polar customers/invoices, OpenMeter meters/usage, Novu
    deliveries, Postal mail log, GlitchTip issues, OpenPanel
    events, Meilisearch index stats, Convex function/run state,
    Valkey cache stats, Ory Keto tuple inspector).
11. **Universal omnibar search service** (Meilisearch-backed
    federated index respecting field security).
12. **Reason catalog expansions** covering every new high-risk
    action.
13. **Capability snapshot v2** (admin-org role + derived
    navigation map).
14. **Run-as / acting-as banner state surface** from
    support-operations.
15. **Workflow-runs admin envelope**.
16. **Notification-center admin envelope**.
17. **`admin-operator-test-tokens` module** (ADR-024 +
    [module spec](../../02-modules/access/admin-operator-test-tokens/spec.md)):
    contracts, manifest, drizzle persistence (PostgreSQL-backed
    durable `admin_operator_test_tokens` + ring-bounded
    `admin_operator_test_token_usage_events`), module helpers,
    `AdminOperatorTestTokensService` under
    `packages/platform/src/services/access/` with a
    service-level `admin-owner` hard floor and
    `breakGlassAllowed = false`, hash-only secret-at-rest
    (`tokenPrefix` non-secret correlator + HMAC-SHA-256
    `tokenHash`), env-bound signing key
    (`ADMIN_OPERATOR_TEST_TOKENS_SIGNING_KEY`,
    `Schema.NonEmptyString`, no fallback synthesis), reason
    catalog (`admin-operator-test-tokens.issue` requires
    `reasonAttachmentText`, `admin-operator-test-tokens.revoke`
    does not), audit-action constants (`issued`, `revoked`,
    `listed`, `usedSuccess`, `usedFailure`), root-safe app
    helpers (`listAdminOperatorTestTokensFromEnvironment`,
    `issueAdminOperatorTestTokenFromSessionId`,
    `revokeAdminOperatorTestTokenFromSessionId`), `/admin/tokens`
    route with `RevealField` + `HighRiskActionGuard` +
    plaintext-once dialog, `.env.example` entry, signing-key
    rotation runbook, tracker entry.

Every item lands behind shared contracts, service, root-safe app
helper, HTTP adapter, manifest, tests, tracker update.

## 10. Test strategy

Layers (existing 4 + 2 new):

1. `tests/platform/**/*.test.ts` — shared services, first-party
   route helpers, request-context, projections, mutations.
2. `apps/admin-app/src/**/*.browser.test.tsx` — shell, panes,
   patterns, reveal flow, denied/empty/error states.
3. `tests/platform/backend-e2e/**/*.test.ts` — trusted-session,
   authorization, backend mutation flows.
4. `packages/e2e/tests/**/*.spec.ts` — Playwright operator
   journeys.
5. **NEW**: `packages/e2e/visual/**` — Playwright per-route
   screenshots at desktop / tablet / mobile.
6. **NEW**: `packages/e2e/a11y/**` — axe a11y audit per primary
   route; serious violations fail CI.

Validation gate stays:
`bun run format:check`, `bun run typecheck`, `bun run test`,
plus new `bun run test:e2e`, `bun run test:visual`,
`bun run test:a11y`.

Per-component tests live in `packages/ui` and cover every state.

## 11. Implementation phases

### Phase 0 — Governance reset, foundation & tear-down

1. Refresh the admin-app spec, implementation plan, and implementation
   tracker so the usefulness bar, zero-manual-token rule, responsive
   recomposition model, screen coverage, and Signal Deck design
   direction are explicit before implementation proceeds.
2. Add Tailwind 4, Radix primitives, TanStack Table 8 to the
   workspace (admin-app + packages/ui).
3. Build `packages/ui` v2: tokens, primitives, desk shell
   patterns, data/governance patterns, runtime helpers.
4. Delete every current `apps/admin-app/src/routes/**` page and
   `apps/admin-app/src/components/**` component except for the OIDC
   behavior edges and route-helper seams that still carry valid
   non-visual behavior. Keep `auth/start.ts`, `auth/callback.ts`,
   `auth/logout.ts`, `auth/stale-session.ts`, `lib/*` route data
   helpers, and `testing/*` fixtures; redesign `auth/sign-in.tsx`,
   `auth/sign-in-screen.tsx`, and all shared visual states.
5. Regenerate `routeTree.gen.ts` through TanStack codegen.

### Phase 1 — Backend gap closure (no UI yet)

Land §9 items 1–6 first (admin-org, saved views/workspaces,
ops-home v2, tenant-workspace v2, break-glass grant/release,
webhook delivery envelope), then items 7–16. Tests, manifests,
contracts, services, helpers, HTTP adapters, tracker entries
per item.

### Phase 2 — Desk core + Ops Home + Tenant + Audit + Omnibar v1

Wire the desk shell to real data. Ship `/desk`, `/r/tenant`,
`/r/tenants`, `/r/audit`. Omnibar v1 (federated search across
tenants, users, configs, flags).

### Phase 3 — Governance & access

`/r/config`, `/r/flag`, `/r/access`. DiffApprovalDrawer fully
wired. Admin-org role mapping consumed in capability snapshot
v2.

### Phase 4 — Domain operator screens

`/r/billing`, `/r/branding`, `/r/domain`, `/r/invoice`,
`/r/meter`. Land Polar revenue + OpenMeter usage helpers.

### Phase 5 — Support, compliance, integrations

`/r/support`, `/r/incident`, `/r/retention`, `/r/legal-hold`,
`/r/webhook`, `/r/delivery`, `/r/api-key`.

### Phase 6 — Vendor surfaces & workflow

`/r/vendors`, `/r/vendor`, `/r/notify`, `/r/runs`, `/r/run`,
`/r/kc-user`, `/r/kc-role`.

### Phase 7 — Admin org settings

`/admin/members`, `/admin/workspaces`, `/admin/tokens`,
`/admin/profile`, `/admin/audit`.

### Phase 8 — Responsive hardening + e2e + visual + a11y

Tablet + mobile recomposition pass for every pane and pattern.
Replace skipped Playwright smoke with real journeys. Visual
regression and axe a11y CI gates on.

## 12. Spacing & density rules (binding)

- Allowed spacing units: `2, 4, 6, 8, 10` px.
- Sum of paddings/margins between adjacent surfaces ≤ 10px.
  When 10 is needed, place on one side only.
- Pane outer padding ≤ 10px; inner content uses its own 4–8px
  rhythm.
- Standard table row 32px (compact 28, comfortable 36).
- Min input height 32px, button 32px (touch targets 44px on
  mobile only).
- Min font: body 13px, monospace metadata 11px, mobile action
  labels 14px.

## 13. Liquid glass tokens (excerpt)

```css
--glass-bg: color-mix(in oklab, var(--canvas-900) 60%, transparent);
--glass-blur: 28px;
--glass-border: 1px solid color-mix(in oklab, white 6%, transparent);
--glass-highlight: inset 0 1px 0 color-mix(in oklab, white 5%, transparent);
--glass-shadow: 0 8px 24px -12px rgb(0 0 0 / 0.6);
--glass-tint-domain: var(--domain-tint, transparent); /* 8% alpha */
```

Domain tints (subtle): identity violet, governance indigo,
tenants teal, billing emerald, branding rose, retention amber,
support crimson, observability sky.

## 14. Explicit guardrails

1. No sidebar + topbar shells.
2. No UI-only authorization.
3. No internal HTTP hops from first-party app routes to
   backend-owned handlers.
4. No placeholder buttons.
5. No provider placeholders that contradict the actual stack.
6. No separate one-off UI system inside admin-app after
   `packages/ui` v2 exists.
7. No broad client-state store introduced just to coordinate
   tables, filters, and drawers.
8. No settings, notifications, or diagnostics shells without
   real backed functionality.
9. No manual bearer-token or id text inputs visible to
   operators (Picker / omnibar only; one paste-by-id fallback
   disclosure).
10. No pill badges, decorative glow orbs, or nested
    card-in-card depth.
11. No padding/margin pairs totalling more than 10px between
    adjacent surfaces.
12. No horizontal-scroll-only tables on any breakpoint.
13. No current admin-app screen or component is grandfathered into the
    redesign. If the surface remains in the final product, it must be
    rebuilt into the shared Signal Deck language.

## 15. Cross-reference

- Shell decision: `specs/03-adr/architecture/ADR-022-admin-operator-desk-shell.md`
- Admin-organization module: `specs/03-adr/identity/ADR-023-admin-organization-membership.md`
- Tracker entry: `specs/00-governance/implementation-tracker.md`
  (admin-app row, plus a new row for the `admin-organization`
  module).
