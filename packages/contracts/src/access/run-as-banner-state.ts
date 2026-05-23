/**
 * Run-as / acting-as banner state contracts (admin-app
 * implementation plan §9 item 14). The Operator Desk shell renders
 * a banner whenever a session-bound break-glass grant is active for
 * the current actor; the banner exposes a one-click release that
 * requires a reason-catalog id + attachment.
 *
 * Owner-locked design (enforced in the platform service at
 * `packages/platform/src/services/access/run-as-banner-state-service.ts`):
 *
 *   - The banner state is derived per-request from the existing
 *     manual break-glass repository — there is NO new persistence
 *     surface. The service composes the support-operations
 *     break-glass storage to find the single active grant whose
 *     `grantedTo` matches the current actor and (if any) projects
 *     `secondsRemaining` against an injected `Clock`.
 *   - `releasable` is `true` if and only if the requesting actor
 *     IS the grantee (the support operator currently using the
 *     break-glass session) OR holds the `admin-owner` admin-org
 *     role. Anonymous actors short-circuit to
 *     `{ active: false, releasable: false }` and emit NO audit.
 *   - Release flows through the SAME `validateReasonForAction` +
 *     `requiresAttachment` rules used by the manual break-glass
 *     service so reason-shopping or attachment-skipping errors
 *     surface identically across surfaces.
 *
 * Field shape: the inactive variant carries only
 * `{ active: false, releasable: false }`; the active variant adds
 * the full envelope. `secondsRemaining` is computed at the service
 * boundary so the shell does not have to clock-skew-compensate.
 */
import { Schema } from "effect";
import { ActorTypeSchema } from "./actor-types";
import { RequestContextSchema } from "./request-context";
import { IsoTimestampSchema } from "../runtime/timestamps";

export const RunAsBannerStateSchema = Schema.Struct({
  active: Schema.Boolean,
  grantId: Schema.optional(Schema.NonEmptyString),
  actingAsActorId: Schema.optional(Schema.NonEmptyString),
  actingAsActorType: Schema.optional(ActorTypeSchema),
  reasonId: Schema.optional(Schema.NonEmptyString),
  reasonText: Schema.optional(Schema.NonEmptyString),
  reasonAttachmentText: Schema.optional(Schema.NonEmptyString),
  grantedAt: Schema.optional(IsoTimestampSchema),
  expiresAt: Schema.optional(IsoTimestampSchema),
  secondsRemaining: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  ),
  releasable: Schema.Boolean,
});

export type RunAsBannerState = Schema.Schema.Type<
  typeof RunAsBannerStateSchema
>;

export const RunAsBannerStateInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
});

export type RunAsBannerStateInput = Schema.Schema.Type<
  typeof RunAsBannerStateInputSchema
>;
