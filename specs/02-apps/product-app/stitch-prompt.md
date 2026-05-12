# Stitch Prompt: Product App

Use this prompt in its own Stitch project. Do not combine it with the public web or admin app prompt.

## Prompt

Design the **product app** for **Comvestec Solutions SaaS Foundation**, a governed multi-tenant SaaS platform. This app is the **authenticated tenant-facing workspace**. It should feel like a secure, fast, high-trust operational product shell that sits on top of backend-resolved authorization, billing state, notifications, file storage, search, and tenant branding.

This is not a one-off line-of-business app. It is the reusable customer-facing application shell for future Comvestec SaaS products. The design should express that the app is modular, entitlement-aware, and tenant-aware from the first screen.

Treat this as an **accepted-direction design target** for the product app, not a claim that every screen family described here already exists in the current shipped shell.

Treat **desktop, tablet, and mobile as equal-priority responsive targets**. No device size is a lesser-priority version of the product app.

## Product context

- Users are authenticated end users and tenant admins working inside their own tenant context.
- Access, authorization, billing visibility, module visibility, and branding all come from backend state, not frontend guesses.
- The app should support platform defaults as well as entitled tenant branding tokens applied to shell chrome, navigation, and shared documents.
- Current backend foundations already support auth callback completion, session bootstrap, entitlement-aware billing status, and notification, file-storage, and search module surfaces.

## Visual direction

- Create a **precision workspace** aesthetic.
- The product should feel fast, focused, and premium, with strong information hierarchy and disciplined density.
- Prefer a dark or deep-neutral shell with lighter working surfaces, or an equally distinctive high-contrast alternative that still feels serious and operator-grade.
- Use typography with character: a crisp, modern sans for application UI plus a subtle technical accent style for labels, counters, or command areas.
- Motion should feel purposeful: command-palette reveal, panel transitions, subtle loading shimmer, row hover behavior, and status changes that communicate confidence.
- Avoid generic analytics-dashboard aesthetics and avoid cluttered enterprise dullness.

## What this app must communicate

1. The user is inside a tenant-aware, authenticated workspace.
2. Authorization and entitlements are resolved before sensitive data is shown.
3. Modules, billing status, and notifications are part of the platform shell.
4. Tenant branding can personalize the shell without breaking platform consistency.
5. The product is extensible and modular, not a single-purpose tool.

## Screen set to design

Design a cohesive product-app screen family for these screens:

1. **Signed-in home or dashboard**
   - Hero or primary workspace summary.
   - Visible tenant context and current actor context.
   - Module launcher or work areas.
   - Billing summary, recent activity, and operational status signals.
   - Space for tenant branding in a controlled, approved way.

2. **Tenant-aware shell and navigation system**
   - Global navigation, tenant switcher, search entry point, user menu, and notification entry point.
   - A reusable shell pattern that can support future modules.
   - Breadcrumbs, page titles, and context panels should feel clear and mature.

3. **Billing and subscription view**
   - Show plan, billing interval, status, current period state, usage summary, and entitlement cues.
   - Make upgrade or subscription-management entry points visible without feeling like a marketing page.
   - Show what is active, pending, or unavailable because of entitlement state.

4. **Checkout return and billing-status states**
   - Post-checkout success, processing, cancel, and recovery states.
   - Make it clear that checkout return is informative, while actual entitlement activation comes from verified backend reconciliation.
   - Bridge the user cleanly from purchase flow back into the authenticated product workspace.

5. **Notifications center**
   - In-app inbox with unread, read, and dismissed states.
   - Channel, family, status, created time, and action CTA patterns.
   - Preference and suppression controls should feel deliberate and auditable.
   - This screen should support both compact inbox browsing and detailed message inspection.

6. **Files and search workspace**
   - Combined or closely related screens for tenant-scoped search and managed files.
   - Search results with filters, document-family cues, metadata, and clean empty states.
   - File table or card view with file name, type, size, status, and actions.
   - Show that search and file access are secure, tenant-scoped platform capabilities.

7. **Account, settings, and security**
   - User profile, tenant-facing settings, branding-aware shell settings, and notification preferences.
   - Security and session affordances should feel trustworthy and clear.
   - Include room for role or access context without exposing admin-only controls.

8. **Access-state screens**
   - No active session.
   - Access denied or not entitled.
   - Stale session requiring reauthentication.
   - Module unavailable because a flag or entitlement is disabled.
   - These states should feel polished and reassuring, not broken.

## Important screen behaviors and states

- The app should have a polished state when backend bootstrap succeeds.
- It should also have a safe shell state when no validated session is present.
- Checkout return states should feel connected to the authenticated app, but should never imply that the frontend alone confirmed billing truth.
- Billing and access status must appear as server-trusted facts, not soft suggestions.
- Tenant branding should be visible in controlled areas such as top-level chrome, workspace header, document accents, and settings previews.
- Module navigation should feel extensible so new future modules can slot in cleanly.

## Key components and patterns

- Left navigation or hybrid sidebar-header shell.
- Tenant switcher.
- Command palette or global quick actions.
- Search box with filters and recent activity.
- Billing status cards and entitlement callouts.
- Notifications rail or inbox list-detail layout.
- File table with metadata-rich rows and safe action menus.
- Empty states, no-results states, loading states, and permission-guard banners.
- Reusable cards, tabs, drawers, and detail side panels that feel premium and cohesive.

## Content and tone guidance

- Tone is calm, capable, and operationally clear.
- Do not make this feel like a social app, crypto dashboard, or B2C consumer product.
- Make the app feel trustworthy for teams managing real tenant data and subscriptions.
- Use plain language for access, billing, notification, and module status.

## Responsive expectations

- Design desktop, tablet, and mobile product-app layouts as first-class deliverables from the start.
- Re-compose navigation, workspace panels, list-detail views, and dense content intentionally for each size instead of simply shrinking the desktop layout.
- Tablet and mobile experiences should feel just as considered, trustworthy, and production-ready as desktop.

## Important constraints

- No client-only authorization patterns.
- No fake data-heavy visualizations that imply nonexistent product-specific analytics.
- No internal admin workflows here.
- No generic dashboard template look.
- Respect the platform's modular, entitlement-aware shape.

## Deliverable intent

Create a distinctive authenticated product workspace that can credibly carry billing, notifications, files, search, settings, and future modules. It should feel like the secure customer-facing center of a governed SaaS platform.
