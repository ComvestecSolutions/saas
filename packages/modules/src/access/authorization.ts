import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  authorizationNamespace,
  AuthorizationNamespaceSchema,
  authorizationRelation,
  AuthorizationRelationSchema,
  permissionScope,
  PermissionScopeSchema,
  PlatformScopeSchema,
  RequestContextSchema,
} from "@comvestec/contracts";
import {
  actorSupportsPrivilegedSupportEscalation,
  hasPrivilegedBreakGlassAccess,
} from "./break-glass";

export {
  AuthorizationNamespaceSchema,
  AuthorizationRelationSchema,
} from "@comvestec/contracts";
export type {
  AuthorizationNamespace,
  AuthorizationRelation,
} from "@comvestec/contracts";

export const AuthorizationTupleSchema = Schema.Struct({
  namespace: AuthorizationNamespaceSchema,
  object: Schema.NonEmptyString,
  relation: AuthorizationRelationSchema,
  subject: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
});

export type AuthorizationTuple = Schema.Schema.Type<
  typeof AuthorizationTupleSchema
>;

const AuthorizationTupleListSchema = Schema.Array(AuthorizationTupleSchema);

export const AuthorizationCheckInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  namespace: AuthorizationNamespaceSchema,
  object: Schema.NonEmptyString,
  relation: AuthorizationRelationSchema,
  permissionScope: Schema.optional(PermissionScopeSchema),
});

export type AuthorizationCheckInput = Schema.Schema.Type<
  typeof AuthorizationCheckInputSchema
>;

export const AuthorizationDecisionSchema = Schema.Struct({
  allowed: Schema.Boolean,
  cacheKey: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  auditRequired: Schema.Boolean,
  matchedTuple: Schema.optional(AuthorizationTupleSchema),
});

export type AuthorizationDecision = Schema.Schema.Type<
  typeof AuthorizationDecisionSchema
>;

export const AuthorizationExplanationSchema = Schema.Struct({
  cacheKey: Schema.NonEmptyString,
  subjectCandidates: Schema.Array(Schema.NonEmptyString),
  matchedSubject: Schema.optional(Schema.NonEmptyString),
  usedBreakGlass: Schema.Boolean,
  requestScope: PlatformScopeSchema,
  requestScopeId: Schema.NonEmptyString,
});

export type AuthorizationExplanation = Schema.Schema.Type<
  typeof AuthorizationExplanationSchema
>;

const ScopeRelationMappingSchema = Schema.Struct({
  permissionScope: PermissionScopeSchema,
  namespace: AuthorizationNamespaceSchema,
  relation: AuthorizationRelationSchema,
});

type ScopeRelationMapping = Schema.Schema.Type<
  typeof ScopeRelationMappingSchema
>;

const ScopeRelationMappingListSchema = Schema.Array(ScopeRelationMappingSchema);

export const defaultScopeRelationMappings = Schema.validateSync(
  ScopeRelationMappingListSchema,
)([
  {
    permissionScope: permissionScope.tenantRead,
    namespace: authorizationNamespace.tenant,
    relation: authorizationRelation.viewer,
  },
  {
    permissionScope: permissionScope.tenantWrite,
    namespace: authorizationNamespace.tenant,
    relation: authorizationRelation.editor,
  },
  {
    permissionScope: permissionScope.configWrite,
    namespace: authorizationNamespace.module,
    relation: authorizationRelation.admin,
  },
  {
    permissionScope: permissionScope.flagWrite,
    namespace: authorizationNamespace.featureFlag,
    relation: authorizationRelation.admin,
  },
  {
    permissionScope: permissionScope.brandingManage,
    namespace: authorizationNamespace.brandingProfile,
    relation: authorizationRelation.admin,
  },
  {
    permissionScope: permissionScope.auditRead,
    namespace: authorizationNamespace.auditEvent,
    relation: authorizationRelation.viewer,
  },
  {
    permissionScope: permissionScope.supportImpersonate,
    namespace: authorizationNamespace.supportCase,
    relation: authorizationRelation.impersonator,
  },
  {
    permissionScope: permissionScope.billingWrite,
    namespace: authorizationNamespace.billingEntitlement,
    relation: authorizationRelation.admin,
  },
] satisfies readonly ScopeRelationMapping[]);

const AuthorizationModuleOptionsSchema = Schema.Struct({
  tuples: Schema.Array(AuthorizationTupleSchema),
  cacheTtlSeconds: Schema.Number,
  maxCacheSize: Schema.optional(Schema.Number),
});

type AuthorizationModuleOptions = Schema.Schema.Type<
  typeof AuthorizationModuleOptionsSchema
>;

const buildSubjectCandidates = (
  input: AuthorizationCheckInput,
): readonly string[] => {
  const actorCandidates = input.requestContext.actorId
    ? [input.requestContext.actorId, `actor:${input.requestContext.actorId}`]
    : [];

  const tenantCandidates = [
    `tenant:${input.requestContext.tenant.scope}:${input.requestContext.tenant.scopeId}`,
    `scope:${input.requestContext.tenant.scopeId}`,
    `actor-type:${input.requestContext.actorType}`,
  ];

  return [...actorCandidates, ...tenantCandidates];
};

const buildCacheKey = (input: AuthorizationCheckInput) =>
  [
    input.requestContext.correlationId,
    input.requestContext.actorType,
    input.requestContext.actorId ?? "anonymous",
    input.requestContext.tenant.scope,
    input.requestContext.tenant.scopeId,
    input.namespace,
    input.object,
    input.relation,
    input.permissionScope ?? "none",
  ].join(":");

const mappingAllowsRequest = (input: AuthorizationCheckInput) =>
  input.permissionScope === undefined ||
  defaultScopeRelationMappings.some(
    (mapping) =>
      mapping.permissionScope === input.permissionScope &&
      mapping.namespace === input.namespace &&
      mapping.relation === input.relation,
  );

export type AuthorizationModuleService = {
  readonly listTuples: Effect.Effect<readonly AuthorizationTuple[]>;
  readonly check: (
    input: unknown,
  ) => Effect.Effect<AuthorizationDecision, ParseResult.ParseError>;
  readonly explain: (
    input: unknown,
  ) => Effect.Effect<AuthorizationExplanation, ParseResult.ParseError>;
};

export class AuthorizationModule extends Context.Tag("AuthorizationModule")<
  AuthorizationModule,
  AuthorizationModuleService
>() {}

export const makeAuthorizationModule = (input: unknown) =>
  Schema.decodeUnknown(AuthorizationModuleOptionsSchema)(input).pipe(
    Effect.map((options): AuthorizationModuleService => {
      const cache = new Map<
        string,
        { readonly decision: AuthorizationDecision; readonly expiresAt: number }
      >();

      const maxCacheSize = options.maxCacheSize ?? 1000;

      const evictExpiredEntries = (now: number) => {
        for (const [key, entry] of cache) {
          if (entry.expiresAt <= now) {
            cache.delete(key);
          }
        }
      };

      const tuples = [...options.tuples];

      const check = (checkInput: unknown) =>
        Schema.decodeUnknown(AuthorizationCheckInputSchema)(checkInput).pipe(
          Effect.flatMap((decodedInput) => {
            const cacheKey = buildCacheKey(decodedInput);
            const now = Date.now();
            const cached = cache.get(cacheKey);

            if (cached !== undefined && cached.expiresAt > now) {
              return Effect.succeed(cached.decision);
            }

            const subjectCandidates = buildSubjectCandidates(decodedInput);
            const breakGlassAllowed = hasPrivilegedBreakGlassAccess(
              decodedInput.requestContext,
              now,
            );

            const matchedTuple = tuples.find(
              (tuple) =>
                tuple.namespace === decodedInput.namespace &&
                tuple.object === decodedInput.object &&
                tuple.relation === decodedInput.relation &&
                tuple.tenantScope ===
                  decodedInput.requestContext.tenant.scope &&
                tuple.tenantScopeId ===
                  decodedInput.requestContext.tenant.scopeId &&
                subjectCandidates.includes(tuple.subject),
            );

            const decision = breakGlassAllowed
              ? {
                  allowed: true,
                  cacheKey,
                  reason: "Allowed via break-glass context.",
                  auditRequired: true,
                }
              : !mappingAllowsRequest(decodedInput)
                ? {
                    allowed: false,
                    cacheKey,
                    reason:
                      "Permission scope does not map to the requested namespace relation.",
                    auditRequired: false,
                  }
                : matchedTuple === undefined
                  ? {
                      allowed: false,
                      cacheKey,
                      reason: "No matching authorization tuple was found.",
                      auditRequired: actorSupportsPrivilegedSupportEscalation(
                        decodedInput.requestContext.actorType,
                      ),
                    }
                  : {
                      allowed: true,
                      cacheKey,
                      reason: "Matched declared authorization tuple.",
                      auditRequired: actorSupportsPrivilegedSupportEscalation(
                        decodedInput.requestContext.actorType,
                      ),
                      matchedTuple,
                    };

            return Schema.decodeUnknown(AuthorizationDecisionSchema)(
              decision,
            ).pipe(
              Effect.tap((validatedDecision) =>
                Effect.sync(() => {
                  cache.set(cacheKey, {
                    decision: validatedDecision,
                    expiresAt: now + options.cacheTtlSeconds * 1000,
                  });

                  if (cache.size > maxCacheSize) {
                    evictExpiredEntries(now);
                  }
                  if (cache.size > maxCacheSize) {
                    const oldest = cache.keys().next().value;
                    if (oldest !== undefined) {
                      cache.delete(oldest);
                    }
                  }
                }),
              ),
            );
          }),
        );

      const explain = (checkInput: unknown) =>
        Schema.decodeUnknown(AuthorizationCheckInputSchema)(checkInput).pipe(
          Effect.flatMap((decodedInput) => {
            const subjectCandidates = buildSubjectCandidates(decodedInput);
            const matchedTuple = tuples.find(
              (tuple) =>
                tuple.namespace === decodedInput.namespace &&
                tuple.object === decodedInput.object &&
                tuple.relation === decodedInput.relation &&
                tuple.tenantScope ===
                  decodedInput.requestContext.tenant.scope &&
                tuple.tenantScopeId ===
                  decodedInput.requestContext.tenant.scopeId &&
                subjectCandidates.includes(tuple.subject),
            );

            return Schema.decodeUnknown(AuthorizationExplanationSchema)({
              cacheKey: buildCacheKey(decodedInput),
              subjectCandidates: [...subjectCandidates],
              matchedSubject: matchedTuple?.subject,
              usedBreakGlass: hasPrivilegedBreakGlassAccess(
                decodedInput.requestContext,
              ),
              requestScope: decodedInput.requestContext.tenant.scope,
              requestScopeId: decodedInput.requestContext.tenant.scopeId,
            });
          }),
        );

      return {
        listTuples: Effect.succeed([...tuples]),
        check,
        explain,
      };
    }),
  );

export const makeAuthorizationModuleLayer = (input: unknown) =>
  Layer.effect(AuthorizationModule, makeAuthorizationModule(input));
