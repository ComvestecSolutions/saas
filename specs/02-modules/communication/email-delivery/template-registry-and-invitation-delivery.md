# Email Template Registry And Invitation Delivery Workflows

Status: accepted

## Purpose

Close the next `email-delivery` gap by extending the code-owned, version-controlled template registry from the initial tenant invitation issue send into reminder and expiry-notification workflows over the same backend-owned invitation surface.

## Scope

1. Code-owned registry of system email templates with stable template identifiers and explicit version strings.
2. Typed rendering contracts for invitation issue, reminder, and expiry-notification email subject, HTML, and plaintext payloads.
3. Tenant invitation issuance dispatch through the shared `email-delivery` service after durable invitation persistence succeeds.
4. Workflow-jobs-backed reminder and expiry-notification scheduling for email-backed invitations.
5. Durable invitation-side idempotence state for reminder and expiry-notification queue events.
6. Delivery tracking that records the versioned template identifier used for the send.

## Non-Goals

1. Operator-authored template editing or database-backed template storage.
2. A new first-party redemption page or unauthenticated invitation acceptance flow.
3. Delivery retry orchestration beyond workflow-jobs replay and the existing tracked-delivery and provider-event handling.
4. Multi-step reminder campaigns, per-tenant opt-out policy beyond runtime config, or non-email invitation follow-up channels.

## Template Registry

1. `email-delivery` owns stable template identifiers and version strings in committed code.
2. The registry is reviewable and version-controlled in source; rendered email bodies are not stored durably.
3. The tracked template metadata recorded on delivery rows is the versioned template identifier used for the send.
4. Template rendering consumes typed input and may derive sign-in or handoff URLs from shared platform runtime configuration.

## Invitation Issue Flow

1. Tenant invitation issuance persists the invitation record and audit event before any email delivery attempt.
2. The trusted-session admin tenant-management service remains the owning workflow surface; this slice must not introduce internal HTTP hops.
3. After persistence succeeds, the service renders the invitation email template and calls the shared `email-delivery` service with the target tenant context.
4. The invitation issue response still returns the manual secret handoff so operators can recover when email delivery is unavailable.
5. The response also returns a delivery outcome that distinguishes queued delivery from a post-persist non-queued fallback.
6. Only invitations whose initial issue email queues successfully in an email-enabled runtime schedule automated follow-up jobs; manual-handoff-only issuance remains unscheduled.
7. Post-persist rendering or delivery failures must not revoke, roll back, or silently mutate the already-issued invitation.

## Reminder And Expiry Notification Workflow

1. `tenant-management` owns the invitation lifecycle and the durable reminder or expiry queue markers on the invitation record; `email-delivery` owns template rendering and send tracking; `workflow-jobs` owns delayed execution and replay.
2. Tenant-management introduces a runtime config key `tenant-management.membership.inviteReminderHoursBeforeExpiry` with a code-owned default of `24` hours.
3. Invitation issuance schedules a reminder job for `expiresAt - inviteReminderHoursBeforeExpiry` only when the configured lead time is greater than zero and still lands before the invite expiry timestamp.
4. Invitation issuance schedules an expiry-notification job for `expiresAt` when the initial invitation email queued successfully.
5. Reminder and expiry-notification jobs must re-read the current invitation record and only send when the invitation is still `pending` and the corresponding queue marker is still unset.
6. Reminder jobs must also verify that the current time is still before `expiresAt`; expiry-notification jobs must verify that the current time is at or after `expiresAt`.
7. Invitation records persist `reminderQueuedAt` and `expiryNotificationQueuedAt` timestamps as tenant lifecycle metadata only after the corresponding email-delivery call returns `queued`.
8. If a reminder or expiry-notification email does not queue, the workflow job fails or stays replayable and the corresponding queue marker remains unset.
9. These jobs run through shared services and workflow executors rather than internal HTTP hops, and they reuse the same tenant-branding-aware sender path and `/auth/start` redemption handoff used by the initial invitation issue email.

## Reminder And Expiry Email Content

1. Reminder emails restate the target tenant context, invited relation, expiry timestamp, and authenticated sign-in location while making it clear the invite is still pending.
2. Reminder emails must not re-send the invitation token because the backend persists only the token hash after issuance; recipients are directed to use the original invitation email or request a new invitation from an operator.
3. Expiry-notification emails communicate that the invitation is no longer redeemable, identify the target tenant context and invited relation, and direct operators or recipients back to the authenticated sign-in location for any follow-up workflow.
4. Neither reminder nor expiry-notification templates introduce direct unauthenticated acceptance links, secret recovery, or alternative redemption flows.

## Invitation Email Content

1. The first invitation email communicates the target tenant context, invited relation, expiry timestamp, authenticated sign-in location, and invitation token.
2. This slice hands recipients to the configured application base URL and the existing authenticated redemption workflow rather than inventing a new click-through redemption page.
3. Sender display-name and reply-to branding continue to come from the existing `tenant-branding`-aware `email-delivery` path instead of a separate invitation-only branding store.

## Follow-Up Work

1. Broaden the template registry to other system email consumers such as password reset and richer notification-center owned templates when those backend slices are ready.
2. Add richer operator controls or campaign policy only after the single-reminder plus single-expiry workflow is validated end to end.
