# Stitch Prompt: Tenant Membership Invitation Reminder Email

Use this prompt in its own Stitch project. If you are generating the full email family in one Stitch project, start from [all-email-templates-stitch-project.md](all-email-templates-stitch-project.md).

**Template id:** `tenant-management.membership-invitation-reminder`  
**Current status:** current code-backed template  
**Default app surface:** mirror the destination workspace; use `product-app` for tenant-facing invites and `admin-app` for operator, support, or governance invites  
**Allowed app surfaces:** `product-app`, `admin-app`, restrained `public-web` edge variant only when the destination workspace is still not established

## Prompt

Design the **tenant membership invitation reminder email** for **Comvestec Solutions SaaS Foundation**, a governed multi-tenant SaaS platform.

This email is sent before an outstanding invitation expires. It should feel like a **polite but clear pending-access reminder**. Unlike the initial invitation email, this reminder must not present the invitation token again. Instead, it should direct the recipient back to the sign-in flow and explain that they may need the original invitation email or a new invitation from an operator.

Treat this as an **accepted-direction design target** for a code-owned reminder template.

## Shared app-centric dark-mode rules

- Design in **dark mode only**. Do not generate a light-theme alternative.
- Keep the layout **email-safe and responsive**; translate the chosen app surface through palette, spacing, typography, and panel treatment rather than literal app screens.
- `product-app` should feel like a **precision workspace** reminder in dark mode: deep-neutral shell, premium panels, and calm operational accents.
- `admin-app` should feel like an **operations control tower** reminder in dark mode: denser graphite panels, technical labels, and visibly governed seriousness.
- `public-web` may be used only as a restrained front-door edge variant when the destination surface is not yet known; once the audience is known, use the destination app look and feel.
- If the reminder is for an admin-app user, it must clearly adopt the **admin-app** look and feel.

## Product and workflow context

- The invitation is still pending.
- The user has not completed the authenticated redemption flow yet.
- The reminder must restate the tenant context, invited relation, expiry time, and sign-in path.
- The email should inherit the same trustworthy enterprise brand language as the initial invitation, but with a lighter urgency signal.

## Visual direction

- Create a **pending access reminder** aesthetic in dark mode: calm, clear, slightly time-sensitive.
- Keep the layout visually related to the initial invitation email so recipients recognize the same workflow family.
- Use subtle urgency cues such as a reminder label, time badge, or restrained accent treatment.
- Avoid alarmist red warning styling unless the message is actually expired.

## What this email must accomplish

1. Remind the recipient that the invitation is still pending.
2. Reconfirm the tenant and role context.
3. Show the expiry timestamp clearly.
4. Point the recipient back to sign-in.
5. Explain that the original invitation email or a new operator-issued invite may be needed.

## Dynamic content available

- Tenant label such as scope and scope id
- Recipient email address
- Invited relation
- Expiry timestamp
- Auth start or sign-in URL

## Template sections to design

1. **Header**
   - Branded invitation-family header
   - Reminder status label

2. **Pending reminder block**
   - Headline that the invitation is still pending
   - Supporting copy with tenant context and role
   - Clear expiry callout

3. **Primary CTA**
   - Sign in to continue
   - Secondary note that the original invitation email contains the token

4. **Recovery guidance**
   - Short explanation that if the original invite is no longer available, the recipient should request a new invitation from an operator
   - Keep this helpful and concise

5. **Footer**
   - Branded support identity
   - Calm transactional footer

## Content and tone guidance

- Tone is calm, respectful, and clear.
- The message should encourage completion without sounding like a collection notice.
- Make the lack of token in this email feel intentional and secure.
- Keep the copy focused on next steps.

## Important constraints

- Do not include the invitation token in this reminder.
- Do not design a direct accept flow from the reminder itself.
- Do not imply the invitation was reissued.
- Do not use expired-state styling; this is still a pending-valid invite.
- Do not render light mode.
- Keep the relationship to the initial invitation template visually recognizable.

## Deliverable intent

Create a reminder email that feels clearly connected to the invitation workflow, communicates pending access and time sensitivity well, and gives the recipient a straightforward path back into the authenticated redemption flow.
