# Stitch Prompt: Admin App

Use this prompt in its own Stitch project. Do not combine it with the public web or product app prompt.

## Prompt

Design the **admin app** for **Comvestec Solutions SaaS Foundation**, a governed multi-tenant SaaS platform. This app is the **internal operator and governance control surface** for platform staff. It must feel like a high-trust operational console for people managing runtime config, feature flags, audit review, tenant state, support operations, branding, billing reconciliation, retention controls, and repair workflows.

This is not a lightweight settings page. It is the administrative control plane for a platform where security, auditability, permissions, approval paths, and sensitive-data handling are first-class concerns.

Treat this as an **accepted-direction design target** for the admin app, not a claim that every governance surface described here already ships today beyond the current tenant repair console-centered implementation.

Treat **desktop, tablet, and mobile as equal-priority responsive targets**. No device size is allowed to become an afterthought, even for dense operator workflows.

## Product context

- Primary users are platform operators, support operators, governance reviewers, and compliance staff.
- Every privileged read or mutation needs visible actor, reason, target, approval, and status context.
- Sensitive data may be redacted by default and only revealed after an explicit inspection reason is recorded.
- The app must support deep operator workflows without feeling chaotic.
- Current implemented admin-app UI is centered on the **tenant repair console**, but the accepted platform direction includes broader governance and operations surfaces over existing shared backend helpers.

## Visual direction

- Create an **operations control tower** aesthetic.
- The interface should feel dense, precise, and highly legible, with strong hierarchy and excellent scanning.
- Use a refined industrial or mission-control tone rather than a bland enterprise template.
- Favor structured layouts: split panels, filter bars, timeline rails, detail drawers, data tables, diff panels, approval sidebars, and status-rich cards.
- Color must communicate real meaning: pending, approved, drifted, blocked, active, verifying, expired, error, redacted.
- Typography should support dense operational reading. Add a technical accent for tokens, keys, ids, and workflow states.

## What this app must communicate

1. This is the trusted place to inspect and govern the platform.
2. Powerful actions are possible, but never anonymous and never outside audit.
3. Runtime config, feature flags, tenant state, billing, and support operations are all inspectable with clear provenance.
4. Sensitive fields are protected and explicitly revealed only when policy allows.
5. The app is built for real operational work, not decorative dashboards.

## Screen set to design

Design a cohesive admin-app screen family for these screens:

1. **Operations home**
   - High-level overview of platform health, open repair gaps, pending approvals, recent audit events, support cases, and critical alerts.
   - Show queues and operational posture, not vanity analytics.
   - Strong entry points into deeper governance modules.

2. **Tenant repair console**
   - This is a real current workflow and should be treated as a priority screen.
   - Show open repair gaps, blocked repairs, scheduled retries, stale-running work, and replay or cancel actions.
   - Include an explicit inspection-reason flow before sensitive failure details become visible.
   - Include action feedback states and workflow token or execution context surfaces.

3. **Tenant detail and governance workspace**
   - Unified tenant view for identity, memberships, invitations, onboarding state, current billing posture, branding status, and recent audit activity.
   - Should feel like an operator cockpit for a single tenant.
   - Include support-safe and admin-rich information zones.

4. **Runtime config management**
   - Show module id, key, scope, scope id, code value, runtime value, effective value, source, status, proposal id, changed by, changed at, decided by, and decision reason.
   - Needs strong filtering, inline diff or compare view, effective-value visibility, and approval workflow cues.
   - The screen should make drift, pending proposals, rejected proposals, and applied values obvious.

5. **Feature flags and rollout management**
   - Show key, purpose, default state, effective state, source, entitled state, dependencies, lifecycle, retirement plan, and scope.
   - Include rollout provenance, dependency visibility, and flag health.
   - Make billable versus non-billable flags obvious.

6. **Audit log explorer**
   - Query by module, target, actor, tenant, action, reason, and correlation id.
   - Present immutable audit history clearly, with list-detail or timeline patterns.
   - Make sensitive-read events searchable and easy to inspect without looking noisy.

7. **Support operations and break-glass**
   - Support-case dashboard, tenant health, impersonation session review, break-glass incident handling, approval state, expiry, and post-incident review.
   - Must clearly distinguish support-safe views from higher-privilege admin views.
   - Show time-bounded access and escalation flows explicitly.

8. **Branding and custom-domain management**
   - Show effective branding scope, entitlement visibility, logo and favicon assets, theme tokens, support email, reply-to identity, custom-domain host, lifecycle state, approval history, and effective preview.
   - Include side-by-side preview of platform default versus tenant-branded output.
   - Domain states should include unverified, verifying, active, error, and retired.

9. **Billing reconciliation and entitlements**
   - Show plan, billing interval, status, current period end, included entitlements, metered entitlements, rate limits, usage, invoice history, and durable customer-account linkage.
   - Include reconciliation triggers, webhook-driven truth cues, repair-gap visibility, and operator-safe actions.

10. **Compliance and retention controls**
    - Legal hold placement and release, retention policies by data type, purge guard visibility, and evidence fields.
    - Must feel compliance-grade, traceable, and difficult to misuse accidentally.

11. **Webhooks and API access**
    - API keys, labels, prefixes, webhook subscriptions, URLs, events, status, rotated or revoked timestamps, last delivery state, and replay visibility.
    - Show inbound versus outbound webhook management clearly.

## Important states to include

- Redacted sensitive data until an inspection reason is provided.
- Missing or stale admin session.
- Approved, pending, rejected, drifted, and applied runtime changes.
- Active, deprecated, and retired feature flags.
- Open, blocked, scheduled, stale-running, and resolved repair workflows.
- Active, verifying, error, expired, and retired domain or access states.
- Break-glass access with visible expiry and post-incident review status.

## Key components and patterns

- Dense filter bars and saved views.
- List-detail layouts, timeline panels, approval drawers, and side-by-side diff views.
- Data tables with chips, badges, and row expansion for detail.
- Structured forms for reason capture, approvals, and high-risk actions.
- Persistent context header showing actor, tenant, environment, and correlation clues where relevant.
- Audit timeline, workflow run cards, delivery logs, and redaction reveal patterns.
- Strong empty, loading, success, and failure states designed for operators under pressure.

## Content and tone guidance

- Tone is controlled, authoritative, and calm under pressure.
- Avoid marketing language and avoid consumer-product friendliness.
- This app should feel operationally serious and explicitly governed.
- Make complex governance concepts readable: runtime config sync, approval flow, field security, audit capture, support-safe versus admin views, repair replay, legal hold, webhook verification.

## Responsive expectations

- Design desktop, tablet, and mobile admin-app layouts as first-class deliverables from the start.
- Dense workflows should be intentionally re-composed for each size, not merely squeezed into smaller viewports.
- Tablet and mobile admin screens should preserve clarity, safety, and action confidence for audit, repair, and governance tasks.

## Important constraints

- No anonymous destructive actions.
- No hidden side effects.
- No UI that implies client-side authority over security-sensitive decisions.
- No generic KPI-only dashboard with meaningless charts.
- No oversimplified admin template styling.

## Deliverable intent

Create a high-signal operational control plane that can credibly support governance, repair, audit, compliance, support, branding, and billing workflows. The result should feel like a serious admin surface for a security-conscious SaaS foundation, with the tenant repair console as an especially strong centerpiece.
