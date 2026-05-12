# Stitch Prompt: Billing Invoice Ready Email

Use this prompt in its own Stitch project. If you are generating the full email family in one Stitch project, start from [all-email-templates-stitch-project.md](all-email-templates-stitch-project.md).

**Template id:** `billing.invoice-ready`  
**Current status:** current code-backed template  
**Default app surface:** mirror the destination workspace; use `product-app` by default and switch to `admin-app` for operator-facing billing audiences  
**Allowed app surfaces:** `product-app`, `admin-app`, restrained `public-web` edge variant only when the destination workspace is still not established

## Prompt

Design the **transactional billing invoice ready email** for **Comvestec Solutions SaaS Foundation**, a governed multi-tenant SaaS platform with public web, product app, and admin app.

This email is sent when a tenant-facing invoice is ready for review and payment. It must feel like a **serious operational billing notification**, not a marketing blast and not a PDF invoice replacement. Treat this as a **code-owned system email** that should work for both the platform-default brand and approved tenant-branded sender identity.

Treat the template as an **accepted-direction design target** for the platform email system, not as a claim that every layout detail already exists in production.

## Shared app-centric dark-mode rules

- Design in **dark mode only**. Do not generate a light-theme alternative.
- Keep the layout **email-safe and responsive**; translate the chosen app surface through palette, spacing, typography, panel treatment, and status cues rather than literal dashboard chrome.
- `product-app` should feel like a **precision workspace** in email form: deep-neutral shell, elevated slate panels, crisp metadata rows, and calm teal or amber accents.
- `admin-app` should feel like an **operations control tower** in email form: denser graphite panels, sharper status chips, technical labels, and more explicit governance posture.
- If the recipient is an admin-app user or the invoice workflow is being surfaced for operator action, the email must clearly adopt the **admin-app** look and feel.

## Product and brand context

- The platform is backend-first, audit-aware, and tenant-aware.
- Billing truth comes from verified backend reconciliation and durable entitlement state.
- The email may use approved tenant-branding sender identity, footer identity, and email chrome, but it must still fall back cleanly to the platform brand.
- This message can be sent to billing contacts or tenant users who need a clear next step, so the email should feel trustworthy and direct.

## Visual direction

- Create an **enterprise transactional billing** aesthetic derived from the active app surface.
- Make it feel premium and dependable, not generic SaaS marketing.
- Use a dark charcoal or slate canvas, one dominant invoice summary panel, and a controlled teal or amber accent for the primary CTA.
- Favor strong hierarchy, compact metadata, and obvious action clarity over decorative flourish.
- Avoid hero illustrations, hype copy, or heavy promotional banners.

## What this email must accomplish

1. Confirm that a specific invoice is ready.
2. Make the tenant or account context obvious.
3. Show the critical billing facts clearly: invoice number, total due, and due date.
4. Give the recipient one obvious action to review or pay the invoice.
5. Reinforce that this is a trusted product notification from a governed platform.

## Dynamic content available

- Tenant label such as scope and scope id
- Recipient email address
- Invoice number
- Invoice URL
- Due timestamp
- Total-due display value

## Template sections to design

1. **Header**
   - Platform-default or tenant-branded logo / wordmark area
   - Small transactional label such as billing notice

2. **Primary summary block**
   - Clear headline that the invoice is ready
   - Supporting line that names the tenant context
   - Metadata row or compact facts card for invoice number, total due, and due date

3. **Primary CTA**
   - High-clarity button to review the invoice
   - Secondary plain-text URL treatment for email clients that weaken button rendering

4. **Trust and guidance copy**
   - Short explanation that this was sent to the intended billing contact or recipient email
   - Calm note that the email is a notification surface, while the billing system of record remains backend-owned

5. **Footer**
   - Reply-to / support identity area
   - Platform or tenant footer identity
   - No marketing unsubscribe language for this transactional email

## Content and tone guidance

- Tone should be calm, exact, and trustworthy.
- The email should feel like a finance and operations communication, not a sales email.
- Use plain language for due date, amount, and next action.
- Make the invoice facts easy to scan in under five seconds.

## Important constraints

- Do not design this like a promotional campaign.
- Do not imply that the email itself contains the invoice document.
- Do not expose admin-only billing metadata, webhook details, or internal reconciliation states.
- Do not make the layout dependent on client-side app UI patterns.
- Do not render light mode.
- Keep the design robust for desktop and mobile email clients.

## Deliverable intent

Create a polished transactional invoice-ready email that feels premium, branded, app-aware, and operationally clear. The result should make it easy for a recipient to trust the sender, understand the billing facts, and take the next step immediately.
