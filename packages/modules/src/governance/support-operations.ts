import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  supportOperationsAuditAction,
  AuditEventSchema,
  platformModuleId,
  RequestContextSchema,
} from "@comvestec/contracts";
import {
  actorSupportsPrivilegedSupportEscalation,
  isFutureBreakGlassExpiry,
} from "../access/break-glass";
import { buildAuditEvent } from "./audit-log";

const BreakGlassRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  approvedBy: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  expiresAt: Schema.NonEmptyString,
});

export const BreakGlassGrantSchema = Schema.Struct({
  grantedRequestContext: RequestContextSchema,
  expiresAt: Schema.NonEmptyString,
  auditEvent: AuditEventSchema,
});

export type BreakGlassGrant = Schema.Schema.Type<typeof BreakGlassGrantSchema>;

const SupportEscalationDecisionSchema = Schema.Struct({
  allowed: Schema.Boolean,
  reason: Schema.NonEmptyString,
});

export type SupportEscalationDecision = Schema.Schema.Type<
  typeof SupportEscalationDecisionSchema
>;

export type UnauthenticatedBreakGlassActorError = {
  readonly _tag: "UnauthenticatedBreakGlassActorError";
};

export type UnsupportedSupportActorError = {
  readonly _tag: "UnsupportedSupportActorError";
  readonly actorType: Schema.Schema.Type<
    typeof RequestContextSchema
  >["actorType"];
};

export type InvalidBreakGlassExpiryError = {
  readonly _tag: "InvalidBreakGlassExpiryError";
  readonly expiresAt: string;
};

export type SupportOperationsModuleError =
  | ParseResult.ParseError
  | UnauthenticatedBreakGlassActorError
  | UnsupportedSupportActorError
  | InvalidBreakGlassExpiryError;

export type SupportOperationsModuleService = {
  readonly grantBreakGlassAccess: (
    input: unknown,
  ) => Effect.Effect<BreakGlassGrant, SupportOperationsModuleError>;
  readonly validateEscalation: (
    requestContext: Schema.Schema.Type<typeof RequestContextSchema>,
  ) => Effect.Effect<SupportEscalationDecision, ParseResult.ParseError>;
};

export class SupportOperationsModule extends Context.Tag(
  "SupportOperationsModule",
)<SupportOperationsModule, SupportOperationsModuleService>() {}

export const makeSupportOperationsModule = () =>
  Effect.succeed<SupportOperationsModuleService>({
    grantBreakGlassAccess: (input: unknown) =>
      Schema.decodeUnknown(BreakGlassRequestSchema)(input).pipe(
        Effect.flatMap(
          (
            request,
          ): Effect.Effect<BreakGlassGrant, SupportOperationsModuleError> => {
            if (request.requestContext.actorId === undefined) {
              return Effect.fail({
                _tag: "UnauthenticatedBreakGlassActorError",
              } satisfies UnauthenticatedBreakGlassActorError);
            }

            if (
              !actorSupportsPrivilegedSupportEscalation(
                request.requestContext.actorType,
              )
            ) {
              return Effect.fail({
                _tag: "UnsupportedSupportActorError",
                actorType: request.requestContext.actorType,
              } satisfies UnsupportedSupportActorError);
            }

            if (!isFutureBreakGlassExpiry(request.expiresAt)) {
              return Effect.fail({
                _tag: "InvalidBreakGlassExpiryError",
                expiresAt: request.expiresAt,
              } satisfies InvalidBreakGlassExpiryError);
            }

            return buildAuditEvent({
              requestContext: request.requestContext,
              moduleId: platformModuleId.supportOperations,
              action: supportOperationsAuditAction.breakGlassStarted,
              target: request.requestContext.tenant.scopeId,
              reason: request.reason,
            }).pipe(
              Effect.flatMap((auditEvent) =>
                Schema.decodeUnknown(BreakGlassGrantSchema)({
                  grantedRequestContext: {
                    ...request.requestContext,
                    reason: request.reason,
                    breakGlass: {
                      approvedBy: request.approvedBy,
                      reason: request.reason,
                      expiresAt: request.expiresAt,
                    },
                  },
                  expiresAt: request.expiresAt,
                  auditEvent,
                }),
              ),
            );
          },
        ),
      ),
    validateEscalation: (requestContext) =>
      Schema.decodeUnknown(SupportEscalationDecisionSchema)(
        actorSupportsPrivilegedSupportEscalation(requestContext.actorType)
          ? {
              allowed: true,
              reason: "Actor class supports privileged support escalation.",
            }
          : {
              allowed: false,
              reason: "Actor class does not support support escalation.",
            },
      ),
  });

export const SupportOperationsModuleLive = Layer.effect(
  SupportOperationsModule,
  makeSupportOperationsModule(),
);
