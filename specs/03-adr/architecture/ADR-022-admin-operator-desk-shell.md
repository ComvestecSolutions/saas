# ADR-022: Admin app uses the Operator Desk shell

Status: accepted

Date: 2026-05-17

## Context

The previous admin app used a conventional sidebar + topbar layout
with one route per page. Operator feedback showed three real
problems:

1. Discoverability was poor: the dashboard duplicated the sidebar
   and exposed no live posture.
2. Operators routinely needed to correlate signals across domains
   (audit → config → tenant → billing → support), and a single-route
   model made that painful.
3. Many screens required pasting bearer tokens, tenant ids, or
   correlation ids manually.

We needed a shell pattern that supports many concurrent operator
foci, encodes the workbench layout into URLs for sharing, and never
asks for raw machine values.

## Decision

The admin app uses the **Operator Desk** shell:

1. **Pulse Ribbon** (top, 32px) — live colour-coded segments per
   domain (slate / amber / violet / crimson).
2. **Left Edge Rail** (56px) — vertical dock of pinned resources;
   not a navigation menu.
3. **Center Workbench** — 1–4 resource panes; split / stack / peek
   / pin; layout encoded in the URL.
4. **Right Context Spine** (320px, collapsible to 56px) — actor,
   environment, tenant, correlation, capability, audit echo,
   vendor card.
5. **Bottom Command Strip** (48px, liquid glass) — omnibar
   (scoped prefixes), workspace tabs, alerts pulse, run-as
   banner.

The shell is built with Radix primitives + Tailwind 4 + repo-owned
liquid-glass tokens in `packages/ui` v2. Responsive recomposition
(not shrinkage) is mandatory: tablet collapses to 2-pane workbench
with peek rail and 56px spine; mobile becomes a single-pane stack
with summon-on-demand sheets and a tab-bar command strip variant.

## Consequences

Positive:

- Live posture is permanently visible in the pulse ribbon.
- Operators multi-task without losing context (workbench panes).
- Every resource is omnibar-addressable, eliminating manual id
  entry.
- URL-encoded layout makes operator workflows reproducible and
  shareable.

Negative / accepted trade-offs:

- The shell is genuinely novel; new operators need a brief
  orientation. Mitigation: an onboarding peek that introduces
  pulse / rail / workbench / spine / strip the first time.
- More moving parts than a sidebar layout. Mitigation: every
  surface is owned by exactly one component in `packages/ui` v2;
  no per-screen reinvention.
- Workbench URL state is more complex than a simple route path.
  Mitigation: a single `useWorkbenchUrlState` hook owns
  serialisation/deserialisation.

## Alternatives considered

1. **Sidebar + topbar (status quo)** — rejected for the reasons in
   Context.
2. **Tabbed workspace (browser-tab style)** — better than status
   quo but does not solve cross-domain correlation in one viewport.
3. **Infinite canvas (Figma-style)** — too much spatial cognitive
   load for incident response; abandoned.
4. **Command-palette-only (CLI-like)** — fails the user's
   discoverability and rich-UI requirements.

## References

- `specs/02-apps/admin-app/spec.md`
- `specs/02-apps/admin-app/implementation-plan.md`
- ADR-023 (admin-organization membership module)
