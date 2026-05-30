# Admin App Spec

Status: accepted

Last updated: 2026-05-29

The admin app is the internal operator and governance control surface
for the Comvestec Solutions SaaS Foundation. It is built on the
**Operator Desk** shell (see ADR-022) and the **admin-organization**
membership module (see ADR-023). The current redesign is a **product
reset**, not a cosmetic refresh: every existing admin-app screen,
including sign-in and universal state screens, is redesign scope until
the app becomes the useful, high-trust command center required by this
foundation.

## Redesign mandate

1. Treat the current hybrid of legacy page routes and partial Desk
   routes as transitional only, not the target product.
2. Redesign **every** operator-facing screen from scratch, including:
   sign-in, operations home, every `/desk/*` workbench view, every
   `/admin/*` surface, and the empty/loading/denied/stale/error states
   shared between them.
3. Eliminate operator-hostile workflows such as pasted bearer tokens,
   raw ID hunting, vague logs, dead-end dashboards, and thin mutation
   surfaces that merely expose backend data without useful operator
   guidance.
4. Preserve backend-first governance: shared contracts, services,
   request-context, audit, field security, and typed helper layers stay
   authoritative; the UI becomes a better first-party operator surface
   over those foundations rather than a bypass around them.

## Canonical route taxonomy

The Operator Desk uses `/desk/*` as the canonical workbench route
prefix. Legacy `/r/*` paths remain compatibility redirects during the
cutover window, but new first-party links, route constants, saved
views, and operator-facing documentation must target `/desk/*`.

## Responsibilities

1. Inspect tenants, organizations, memberships, and environments.
2. Manage runtime config, feature flags, permissions, projection
   profiles, rollout state, and bidirectional config sync or
   reconciliation workflows.
3. Review audit trails, sensitive-read events, support actions, and
   operational health.
4. Support compliance, retention, legal-hold, and break-glass
   workflows.
5. Manage tenant branding, branding assets, sender identity metadata,
   and custom-domain verification state.
6. Show the authenticated operator's own profile, role, effective
   capabilities, and current admin-organization membership role.
7. Allow backend-owned operator staffing and tenant membership or
   invitation management without direct database or script edits after
   the initial bootstrap operator exists.
8. Manage the **admin organization** itself (members, roles,
   workspaces, admin-org audit, owner-only test token issuance).
9. Surface live posture, queues, alerts, recent activity, approvals,
   and operator watchlists for every integrated platform domain through
   the persistent **Pulse Ribbon** and **Operations Home**.
10. Provide first-class **vendor surfaces** (Keycloak, Polar,
    OpenMeter, Unleash, Novu, Postal, GlitchTip, OpenPanel,
    Meilisearch, Convex, Valkey, Postgres, Ory Keto) — embedded
    posture cards, read helpers, governed deep-links, and operator
    context so operators rarely need to leave the desk.
11. Make dense information easy to understand through advanced
    filtering, sorting, saved views, correlation pivots, and richly
    structured detail views rather than page hopping.

## Design language

The admin app uses the **Signal Deck** design language:

1. **Matte data planes** carry dense business content such as tables,
   logs, timelines, diffs, charts, inspectors, and forms.
2. **Liquid-glass command surfaces** are limited to shell and
   orientation chrome: Pulse Ribbon, Pin Dock, Context Spine, Command
   Strip, drawers, and small transient overlays.
3. The visual result must feel **precise, premium, dense, and
   trustworthy** — not playful, glowy, or template-like.
4. Typography uses a distinctive but professional hierarchy; internal
   identifiers remain secondary mono metadata rather than primary page
   labels.
5. Persistent shell surfaces are working equipment, not decorative
   containers.

## Shell

The admin app does not use a sidebar+topbar layout. It uses the
Operator Desk shell defined in ADR-022:

1. **Pulse Ribbon** (top, 32px) — live colour-coded segments per
   domain, micro-posture cues, and quick-open behavior.
2. **Pin Dock** (56px) — vertical dock of pinned resources, incidents,
   saved views, tenants, vendors, and current investigations.
3. **Center Workbench** — 1–4 resizable, splittable, stackable,
   peekable, and pinable resource panes; layout encoded in the URL.
4. **Right Context Spine** (320px, collapsible) — actor, environment,
   tenant, correlation, capability, audit echo, vendor card, and
   active risk posture.
5. **Bottom Command Strip** (48px, liquid glass) — omnibar, workspace
   tabs, alerts pulse, quick actions, and run-as banner.

Responsive recomposition (not shrinkage) for tablet and mobile is
mandatory; mobile becomes a single-pane stack with summon-on-demand
sheets for the dock and spine.

## Mandatory redesign coverage

The redesign covers the following first-party surfaces:

1. **Sign-in and auth-adjacent state screens** — governed OIDC handoff,
   stale-session recovery, denied/error shells.
2. **Operations home** — live mission control, posture board, operator
   queue, alerts, approvals, and vendor status.
3. **Tenant operations** — tenant directory, tenant workspace, members,
   invitations, billing, branding, domains, support, repair, and audit.
4. **Governance** — runtime config, feature flags, access control,
   approval flows, and audit exploration.
5. **Revenue operations** — billing posture, invoices, entitlements,
   reconciliation, and OpenMeter usage.
6. **Risk and compliance** — support incidents, break-glass, retention,
   legal hold, sensitive inspection, and high-risk action review.
7. **Integrations and automation** — webhook subscriptions, deliveries,
   API keys, workflow runs, and notification center.
8. **Vendor intelligence** — unified health matrix, vendor detail,
   embedded read models, and deep-link orchestration.
9. **Admin organization** — members, roles, workspaces, admin audit,
   operator profile, and owner-only test tokens.

## Admin organization

A new `admin-organization` module owns membership for the internal
admin org that runs the SaaS foundation. Roles (above the platform
actor types):

| Role               | Summary                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `admin-owner`      | Everything + manage admin members + workspaces + issue test tokens |
| `admin-admin`      | All operator screens + manage non-owner members                    |
| `admin-operator`   | Default platform-operator equivalent (governance, repair, tenants) |
| `support-reviewer` | Support-safe + break-glass review only                             |
| `billing-only`     | Billing & entitlements + invoice export                            |
| `compliance`       | Audit, retention, legal hold, support read-only                    |
| `viewer`           | Read-only everywhere; no mutation, no reveal                       |

Capability resolution is a join of admin-org role and the existing
platform capability snapshot. See ADR-023 for the module design.

## Auto-context (zero manual ids or tokens)

The admin app must never ask operators to paste:

- bearer tokens (resolved server-side from the trusted Keycloak OIDC
  session by the existing identity-session module),
- tenant ids, organization ids, user ids, flag keys, config keys,
  invoice ids, webhook delivery ids, domain hostnames, correlation
  ids — every id-bearing input is a **picker** powered by the
  federated **omnibar** search service.

The only exception is a single **"Lookup by id"** disclosure inside
the picker for paste-by-id fallback. Internal IDs remain secondary
metadata: revealable, copyable, auditable, and never the primary way an
operator understands or reaches data. Test token issuance is owner-only
under `/admin/tokens` and is fully audited.

## Backend Concepts Required For Full Admin Delivery

The redesign requires the following backend additions and expansions
(complete list in `implementation-plan.md` §9). Every item ships
behind shared contracts, services, app helpers (root-safe), and HTTP
adapters before the matching UI lands.

1. `admin-organization` module (members, roles, invites, audit, app
   helpers, HTTP adapter).
2. `admin-saved-views` + `admin-workspaces` per-user persistence.
3. Operations Home aggregate v2 (12 posture counters + per-domain
   sparkline series).
4. Tenant workspace aggregate v2 (adds billing meters, billing
   posture, repair posture, and governed danger-zone context). The
   tenant overview card stays limited to fields with an explicit
   backend owner today: display name, branding state, plan tier,
   billing status, and legal-hold posture. MAU and support-tier
   indicators remain out of scope until dedicated tenant-scoped
   reporting and support-governance owners exist, and tenant-scoped
   current break-glass summaries stay deferred until support-operations
   impersonation and break-glass persistence become tenant-scoped.
5. Manual break-glass grant + release endpoints with reviewer
   metadata persistence.
6. Operator-facing webhook delivery envelope (list, detail, replay,
   retry, signature inspector).
7. Polar revenue projection (read-only, admin-only).
8. OpenMeter usage query (admin-only).
9. Vendor-health aggregator over every adapter healthcheck.
10. Per-vendor read helpers for embedded surfaces (Keycloak, Polar,
    OpenMeter, Novu, Postal, GlitchTip, OpenPanel, Meilisearch,
    Convex, Valkey, Ory Keto).
11. Universal **omnibar search service** (Meilisearch-backed,
    field-security-aware).
12. Expanded reason catalogs covering every new high-risk action.
13. Capability snapshot v2 (admin-org role + derived navigation map).
14. Run-as / acting-as banner state surface from support-operations.
15. Workflow-runs admin envelope (list, detail, replay, cancel).
16. Notification-center admin envelope.

## Delivery Rules For New Backend Concepts

1. Any new backend concept the admin app depends on must land behind
   shared contracts, services, and first-party app helpers before the
   frontend route depends on it.
2. Every new admin-required backend concept or projection expansion
   must ship with focused unit or integration coverage plus backend
   end-to-end coverage, and then gain browser or Playwright coverage
   once the admin route consumes it.
3. The same change must update the relevant manifest, spec,
   implementation plan, and implementation tracker entries so the
   admin app does not drift away from the platform source of truth.
4. If the new concept changes runtime environment requirements,
   operator workflow, or architecture/security boundaries, the same
   slice must update `.env.example`, relevant operator docs/runbooks,
   and any required ADRs.

## Rules

1. The admin app is powerful but not exempt from audit.
2. Sensitive inspection screens must capture actor, reason, and
   correlation context.
3. Config and feature screens must show code-declared defaults,
   persisted overrides, effective values, bidirectional sync status,
   and the approval source before mutation. Diff is a 4-way view
   (declared default ↔ runtime override ↔ pending proposal ↔
   effective).
4. Effective runtime config and feature changes should apply without
   redeploy when the declared schema already exists.
5. The admin app must support both pushing committed code declarations
   into runtime state and pulling approved runtime changes back into
   reviewable code artifacts.
6. The admin app must enforce permission checks for database-side
   runtime changes and record the acting user in audit history.
7. Every admin-side mutation must surface effective changes and
   approval history.
8. Branding screens must show effective scope, entitlement state,
   public-safe versus admin-only fields, and custom-domain lifecycle
   state before mutation.
9. Branding mutations require `branding:manage`, auditable actor
   identity, and an approval path for high-risk changes such as
   custom-domain activation.
10. Direct first-party admin calls must reuse the same trusted-session
    request-context resolution, projected envelopes, security, and
    audit enforcement as backend-owned HTTP callers rather than
    relying on app-local special cases or importing `*-http.ts`
    handlers.
11. Backend-only operator controls for billing reconciliation must
    preserve the same actor identity in Convex execution, audit logs,
    and repair-state persistence that the initiating admin request
    carried.
12. Responsive shell behavior must come from one shared
    device-classification source. Tablet recomposes the Operator Desk
    to two-pane workbench + 48px peek-only dock + 56px collapsed
    spine. Mobile becomes a single-pane stack with summon-on-demand
    sheets for dock and spine and a 56px tab-bar variant of the
    command strip.
13. Spacing: only the units `2, 4, 6, 8, 10` px are allowed. The sum
    of padding/margin between any two adjacent surfaces must never
    exceed 10px. Place 10 on one side only when needed.
14. Visual depth is two layers only (matte canvas + liquid glass).
    Never nest glass inside glass.
15. No sidebar+topbar shells, pill badges, decorative glow orbs,
    KPI-only vanity dashboards, or horizontal-scroll-only tables on
    any breakpoint.
16. Every existing screen, including sign-in and universal states,
    must visibly conform to the same redesign language after cutover;
    no legacy visual surface survives as an exception.
17. Logs, grids, and queues must be dense and useful: strong filtering,
    sorting, correlation pivots, saved views, and meaningful drill-in
    affordances are mandatory.
18. Show useful labels first and internal identifiers second; an
    operator should understand what something is before they ever need
    to inspect its machine identifier.
19. Vendor integration is not deep-link-only by default. When vendor
    data materially improves operator usefulness, the admin app should
    embed that data directly and use deep-links as a governed fallback.
