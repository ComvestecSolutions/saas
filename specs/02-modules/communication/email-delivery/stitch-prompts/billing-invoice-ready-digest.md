# Stitch Prompt: Billing Invoice Ready Digest Email

Use this prompt in its own Stitch project. If you are generating the full email family in one Stitch project, start from [all-email-templates-stitch-project.md](all-email-templates-stitch-project.md).

**Template id:** `billing.invoice-ready-digest`  
**Current status:** current code-backed template  
**Default app surface:** mirror the destination workspace; use `product-app` by default and switch to `admin-app` for operator-facing billing audiences  
**Allowed app surfaces:** `product-app`, `admin-app`, restrained `public-web` edge variant only when the destination workspace is still not established

## Prompt

Design the **transactional invoice digest email** for **Comvestec Solutions SaaS Foundation**, a governed multi-tenant SaaS platform.

This template batches multiple ready invoices for the same recipient into one digest window. It should feel like a **compact operational digest** that helps a user scan several invoice items quickly without losing clarity or trust. This is still a **transactional system email**, not a newsletter.

Treat this as an **accepted-direction design target** for the platform email system, not as a claim that every visual detail already ships.

## Shared app-centric dark-mode rules

- Design in **dark mode only**. Do not generate a light-theme alternative.
- Keep the layout **email-safe and responsive**; translate the chosen app surface through palette, spacing, typography, panel treatment, and status cues rather than literal dashboard chrome.
- `product-app` should feel like a **precision workspace** in email form: deep-neutral shell, elevated slate panels, disciplined list rhythm, and calm operational accents.
- `admin-app` should feel like an **operations control tower** in email form: denser graphite panels, sharper list separators, stronger status chips, and more explicit governance posture.
- If the recipient is an admin-app user or the digest is being surfaced for operator billing review, the email must clearly adopt the **admin-app** look and feel.

## Product and brand context

- The digest belongs to the notification-center and email-delivery foundations.
- The platform is tenant-aware, audit-aware, and backend-governed.
- The email may carry platform-default or approved tenant-branded sender identity and email chrome.
- The digest should feel like an extension of the product app's serious billing surface, but expressed through email-safe components.

## Visual direction

- Create a **structured dark-mode billing digest** with strong hierarchy, compact list rhythm, and high scanability.
- Center the design on stacked cards or responsive list rows that stay readable in real email clients.
- Use a dominant digest summary panel, controlled accent color for action links, and compact metadata chips.
- Avoid noisy desktop-only tables; density is welcome, chaos is not.
- Make the digest feel related to the single invoice email without becoming repetitive.

## What this email must accomplish

1. Make it obvious that several invoices are ready.
2. Show the tenant context and intended recipient clearly.
3. Provide a scannable summary of each invoice item.
4. Offer clear actions for each invoice item without inventing unsupported navigation.
5. Preserve trust and readability when item counts grow.

## Dynamic content available

- Tenant label such as scope and scope id
- Recipient email address
- List of items, each with:
  - invoice number
  - invoice URL
  - due timestamp
  - total-due display value

## Template sections to design

1. **Header**
   - Branded email header for platform-default or tenant-branded contexts
   - Small digest label or billing digest marker

2. **Digest summary block**
   - Headline that clearly states the count of ready invoices
   - Supporting line naming the tenant context
   - Optional compact summary chip area for total item count and next due invoice emphasis

3. **Invoice list**
   - Repeating list rows or stacked cards
   - Each item should show invoice number, amount due, due date, and a direct action link
   - Clear visual separation between items without looking like a marketing feed

4. **Top-level summary treatment**
   - Use non-clickable summary emphasis at the digest level
   - Keep all actionable navigation on the per-item invoice links because those are the current accepted inputs

5. **Footer**
   - Support / reply-to identity
   - Branded footer identity
   - Transactional footer treatment, not campaign-footer behavior

## Content and tone guidance

- Tone is calm, operational, and high-trust.
- The copy should help the recipient act quickly without feeling pressured.
- Keep the digest readable on mobile first, even when several items are present.
- Emphasize clarity and rhythm over decorative flair.

## Important constraints

- Do not design this like a newsletter or promotions email.
- Do not add analytics charts, upsell modules, or marketing banners.
- Do not expose internal queueing, receipt, or reconciliation metadata.
- Do not assume a wide desktop-only table layout.
- Do not render light mode.
- Keep the digest obviously transactional and tenant-aware.

## Deliverable intent

Create a responsive billing digest email that can summarize multiple invoice-ready events cleanly, with strong scanning, strong trust, a dark app-aware visual system, and disciplined enterprise rhythm.
