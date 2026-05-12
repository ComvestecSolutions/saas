# Stitch Prompt: Public Web

Use this prompt in its own Stitch project. Do not combine it with the product app or admin app prompt.

## Prompt

Design the **public web experience** for **Comvestec Solutions SaaS Foundation**, a governed multi-tenant SaaS platform with three first-class applications: public web, product app, and admin app.

This project is the **outward-facing website**. It must help prospective customers understand the platform, compare plans, trust the company, discover documentation, and enter the authenticated subscriber journey safely. The product is **backend-first, security-heavy, and governance-aware**. The public web should feel credible, modern, and precise, not like a generic startup landing page.

Treat this as an **accepted-direction design target** for the public web, not a claim that every surface described here already ships in the current thin public-web shell.

Treat **desktop, tablet, and mobile as equal-priority responsive targets**. No device size is a secondary or reduced-priority deliverable.

## Product and brand context

- The platform is modular, enterprise-ready, and self-hostable.
- It supports individuals, organizations, and enterprises.
- Core themes are trust, operational clarity, auditability, tenant isolation, runtime governance, and clean handoff into authentication and billing.
- The public web must support both the **platform-default brand** and **tenant-branded public entry points** driven by approved branding tokens such as company name, logo, favicon, color accents, and typography choices.
- Public-safe branding is allowed. Internal admin-only data must never appear here.

## Visual direction

- Create an **editorial enterprise** aesthetic: high trust, sharp hierarchy, spacious composition, strong typography, subtle technical motifs.
- Avoid generic AI-looking SaaS design, especially purple gradients, floating blobs, and interchangeable startup card layouts.
- Use a refined light theme with deep graphite, warm stone, muted sand, verdigris or teal accents, and a copper or amber highlight for important calls to action.
- Pair a distinguished editorial headline style with a precise, readable body sans. The site should feel premium, serious, and memorable.
- Add restrained motion and visual rhythm: staggered content reveals, subtle grid or blueprint textures, architecture-diagram cues, clean hover states.

## What this app must accomplish

1. Explain the platform clearly for buyers and evaluators.
2. Present public-safe plans without exposing operator-only billing metadata.
3. Show trust, compliance, and architecture credibility.
4. Offer documentation and contact entry points.
5. Guide users into auth start and hosted checkout without turning the site into a client-owned billing UI.
6. Make tenant-branded public entry points feel real while still clearly falling back to the platform brand when branding is unavailable or unentitled.

## Screen set to design

Design a cohesive screen system for these public-web screens:

1. **Homepage**
   - Hero with clear value proposition for a governed SaaS foundation.
   - Architecture or capability story that explains shared contracts, modules, platform services, and operator workflows.
   - Sections for trust signals, backend-first delivery, platform capabilities, and the three-app model.
   - Strong CTAs for pricing, docs, contact, and sign in.

2. **Pricing and plan discovery**
   - Public-safe plan catalog only.
   - Monthly and yearly toggle.
   - Plan cards with included capabilities, entitlement highlights, and usage notes where appropriate.
   - Comparison section that explains what changes between plans without leaking internal billing metadata.
   - CTA path into hosted checkout.

3. **Trust, security, and compliance page**
   - Explain auditability, field-level security, tenant isolation, runtime governance, webhook verification, and operator accountability.
   - Show compliance and platform controls in a way that feels human and understandable, not like a wall of badges.
   - Include links or callouts to docs, support, and status surfaces.

4. **Documentation or resource hub**
   - Landing page for technical docs, operator runbooks, architecture references, API docs, and setup guides.
   - Clear categorization for developers, operators, and evaluators.
   - Search or quick-jump pattern.

5. **Tenant-branded public entry page**
   - Same structure as the main public entry, but visibly re-skinned with approved tenant branding tokens.
   - Needs room for logo, tenant company name, branded accent colors, and optional custom-domain context.
   - Must still feel safe, clean, and consistent with the platform baseline.

6. **Auth-start handoff screen**
   - Lightweight transition screen before identity redirect.
   - Explain what happens next.
   - Show tenant or platform brand context if available.
   - Include a polished loading or redirect state and graceful fallback messaging.

7. **Checkout return states**
   - Success or processing state after hosted checkout.
   - Cancel state that helps the user recover without dead-ending.
   - Clear message that subscription and entitlement activation are confirmed by verified backend processing, not just by the return URL.

## Key components and patterns

- Header and footer system that can scale to platform-default and tenant-branded contexts.
- Plan cards, pricing toggle, comparison table, FAQ accordion, docs cards, trust modules, and CTA bands.
- A compact architecture visual or diagram style that communicates modular monolith, shared services, and strong governance.
- Status badges and microcopy that make backend-owned flow ownership feel reassuring rather than technical jargon heavy.
- Empty, loading, and pending states that feel intentional.

## Content and tone guidance

- Tone should be confident, technical, calm, and trustworthy.
- Do not sound flashy or hype-driven.
- Explain complex ideas simply: secure auth handoff, governed config, tenant branding, shared services, verified webhook processing.
- Show that this is a reusable platform foundation, not a one-off product microsite.

## Responsive expectations

- Design desktop, tablet, and mobile public screens as first-class deliverables from the start.
- Do not treat tablet or mobile as simplified afterthoughts or later breakpoints.
- Homepage, pricing, docs hub, tenant-branded landing, auth-start, and checkout return screens should all feel fully intentional at every size.

## Important constraints

- No client-only billing assumptions.
- No admin-only data.
- No product-app dashboard patterns here.
- No whimsical consumer app treatment.
- The public web must feel like the safe front door to a serious platform.

## Deliverable intent

Create a polished public-web screen family with a shared visual system, clear navigation, and a convincing conversion path from discovery to auth or checkout handoff. The result should feel premium, credible, and distinctly built for a governed enterprise SaaS foundation.
