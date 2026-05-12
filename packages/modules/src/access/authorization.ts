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

const AuthorizationTargetFields = {
  namespace: AuthorizationNamespaceSchema,
  object: Schema.NonEmptyString,
  relation: AuthorizationRelationSchema,
};

export const AuthorizationTupleSchema = Schema.Struct({
  ...AuthorizationTargetFields,
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
  ...AuthorizationTargetFields,
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

type DelegatedMatchedTupleResolution = {
  readonly matchedTuple: AuthorizationTuple | undefined;
  readonly matchedSubject: string | undefined;
  readonly degradedExplainability: boolean;
};

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
    permissionScope: permissionScope.memberManage,
    namespace: authorizationNamespace.tenant,
    relation: authorizationRelation.admin,
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
    permissionScope: permissionScope.fileRead,
    namespace: authorizationNamespace.file,
    relation: authorizationRelation.viewer,
  },
  {
    permissionScope: permissionScope.fileWrite,
    namespace: authorizationNamespace.file,
    relation: authorizationRelation.editor,
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
    permissionScope: permissionScope.billingRead,
    namespace: authorizationNamespace.billingEntitlement,
    relation: authorizationRelation.viewer,
  },
  {
    permissionScope: permissionScope.billingWrite,
    namespace: authorizationNamespace.billingEntitlement,
    relation: authorizationRelation.admin,
  },
  {
    permissionScope: permissionScope.notificationManage,
    namespace: authorizationNamespace.module,
    relation: authorizationRelation.admin,
  },
  {
    permissionScope: permissionScope.emailManage,
    namespace: authorizationNamespace.module,
    relation: authorizationRelation.admin,
  },
  {
    permissionScope: permissionScope.importExecute,
    namespace: authorizationNamespace.module,
    relation: authorizationRelation.admin,
  },
  {
    permissionScope: permissionScope.exportExecute,
    namespace: authorizationNamespace.module,
    relation: authorizationRelation.admin,
  },
  {
    permissionScope: permissionScope.retentionManage,
    namespace: authorizationNamespace.module,
    relation: authorizationRelation.admin,
  },
  {
    permissionScope: permissionScope.searchAdmin,
    namespace: authorizationNamespace.module,
    relation: authorizationRelation.admin,
  },
  {
    permissionScope: permissionScope.webhookManage,
    namespace: authorizationNamespace.module,
    relation: authorizationRelation.admin,
  },
  {
    permissionScope: permissionScope.workflowManage,
    namespace: authorizationNamespace.module,
    relation: authorizationRelation.admin,
  },
] satisfies readonly ScopeRelationMapping[]);

const AuthorizationModuleRuntimeOptionsSchema = Schema.Struct({
  tuples: Schema.Array(AuthorizationTupleSchema),
  cacheTtlSeconds: Schema.Number,
  maxCacheSize: Schema.optional(Schema.Number),
});

type AuthorizationModuleRuntimeOptions = Schema.Schema.Type<
  typeof AuthorizationModuleRuntimeOptionsSchema
>;

export type AuthorizationDelegatedCheckInput = {
  readonly namespace: AuthorizationTuple["namespace"];
  readonly object: AuthorizationTuple["object"];
  readonly relation: AuthorizationTuple["relation"];
  readonly subject: AuthorizationTuple["subject"];
  readonly tenantScope: AuthorizationTuple["tenantScope"];
  readonly tenantScopeId: AuthorizationTuple["tenantScopeId"];
};

export type AuthorizationDelegatedCheckError = {
  readonly _tag: "AuthorizationDelegatedCheckError";
  readonly reason: string;
  readonly cause: unknown;
};

export type AuthorizationDelegatedCheck = (
  input: AuthorizationDelegatedCheckInput,
) => Effect.Effect<boolean, AuthorizationDelegatedCheckError>;

export type AuthorizationDelegatedTupleLookupInput = {
  readonly namespace: AuthorizationTuple["namespace"];
  readonly object: AuthorizationTuple["object"];
  readonly relation: AuthorizationTuple["relation"];
  readonly subjects: readonly AuthorizationTuple["subject"][];
  readonly tenantScope: AuthorizationTuple["tenantScope"];
  readonly tenantScopeId: AuthorizationTuple["tenantScopeId"];
};

export type AuthorizationDelegatedTupleLookup = (
  input: AuthorizationDelegatedTupleLookupInput,
) => Effect.Effect<
  readonly AuthorizationTuple[],
  AuthorizationDelegatedCheckError
>;

export type AuthorizationModuleOptions = AuthorizationModuleRuntimeOptions & {
  readonly delegatedCheck?: AuthorizationDelegatedCheck;
  readonly delegatedTupleLookup?: AuthorizationDelegatedTupleLookup;
};

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

const resolveCacheExpiry = (input: {
  readonly now: number;
  readonly cacheTtlSeconds: number;
  readonly breakGlassAllowed: boolean;
  readonly requestContext: AuthorizationCheckInput["requestContext"];
}) => {
  const ttlExpiry = input.now + input.cacheTtlSeconds * 1000;

  if (!input.breakGlassAllowed) {
    return ttlExpiry;
  }

  const breakGlassExpiry = input.requestContext.breakGlass?.expiresAt;
  const parsedBreakGlassExpiry =
    breakGlassExpiry === undefined
      ? Number.NaN
      : new Date(breakGlassExpiry).getTime();

  return Number.isFinite(parsedBreakGlassExpiry)
    ? Math.min(ttlExpiry, parsedBreakGlassExpiry)
    : ttlExpiry;
};

const findMatchingTuple = (
  tuples: readonly AuthorizationTuple[],
  input: AuthorizationCheckInput,
  subjectCandidates: readonly string[],
) =>
  tuples.find(
    (tuple) =>
      tuple.namespace === input.namespace &&
      tuple.object === input.object &&
      tuple.relation === input.relation &&
      tuple.tenantScope === input.requestContext.tenant.scope &&
      tuple.tenantScopeId === input.requestContext.tenant.scopeId &&
      subjectCandidates.includes(tuple.subject),
  );

const buildDelegatedCheckInput = (
  input: AuthorizationCheckInput,
  subject: string,
): AuthorizationDelegatedCheckInput => ({
  namespace: input.namespace,
  object: input.object,
  relation: input.relation,
  subject,
  tenantScope: input.requestContext.tenant.scope,
  tenantScopeId: input.requestContext.tenant.scopeId,
});

const resolveDelegatedMatchedSubject = (
  input: AuthorizationCheckInput,
  subjectCandidates: readonly string[],
  delegatedCheck: AuthorizationDelegatedCheck,
) =>
  Effect.forEach(
    subjectCandidates,
    (subject) =>
      delegatedCheck(buildDelegatedCheckInput(input, subject)).pipe(
        Effect.map((allowed) => (allowed ? subject : undefined)),
      ),
    { concurrency: 1 },
  ).pipe(
    Effect.map((results) =>
      results.find((subject): subject is string => subject !== undefined),
    ),
  );

const resolveDelegatedMatchedTuple = (input: {
  readonly request: AuthorizationCheckInput;
  readonly subjectCandidates: readonly string[];
  readonly delegatedTupleLookup: AuthorizationDelegatedTupleLookup;
}) =>
  input
    .delegatedTupleLookup({
      namespace: input.request.namespace,
      object: input.request.object,
      relation: input.request.relation,
      subjects: input.subjectCandidates,
      tenantScope: input.request.requestContext.tenant.scope,
      tenantScopeId: input.request.requestContext.tenant.scopeId,
    })
    .pipe(
      Effect.map((tuples) =>
        input.subjectCandidates
          .map((subject) => tuples.find((tuple) => tuple.subject === subject))
          .find((tuple): tuple is AuthorizationTuple => tuple !== undefined),
      ),
    );

export type AuthorizationModuleService = {
  readonly listTuples: Effect.Effect<readonly AuthorizationTuple[]>;
  readonly check: (
    input: AuthorizationCheckInput,
  ) => Effect.Effect<
    AuthorizationDecision,
    ParseResult.ParseError | AuthorizationDelegatedCheckError
  >;
  readonly explain: (
    input: AuthorizationCheckInput,
  ) => Effect.Effect<
    AuthorizationExplanation,
    ParseResult.ParseError | AuthorizationDelegatedCheckError
  >;
};

export class AuthorizationModule extends Context.Tag("AuthorizationModule")<
  AuthorizationModule,
  AuthorizationModuleService
>() {}

export const makeAuthorizationModule = (input: AuthorizationModuleOptions) =>
  Schema.decodeUnknown(AuthorizationModuleRuntimeOptionsSchema)(input).pipe(
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
      const delegatedCheck = input.delegatedCheck;
      const delegatedTupleLookup = input.delegatedTupleLookup;

      const check = (checkInput: AuthorizationCheckInput) =>
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
            const permissionMappingAllowed = mappingAllowsRequest(decodedInput);
            const localMatchedTuple = findMatchingTuple(
              tuples,
              decodedInput,
              subjectCandidates,
            );

            if (breakGlassAllowed || !permissionMappingAllowed) {
              const expiresAt = resolveCacheExpiry({
                now,
                cacheTtlSeconds: options.cacheTtlSeconds,
                breakGlassAllowed,
                requestContext: decodedInput.requestContext,
              });
              const localDecision = breakGlassAllowed
                ? {
                    allowed: true,
                    cacheKey,
                    reason: "Allowed via break-glass context.",
                    auditRequired: true,
                  }
                : {
                    allowed: false,
                    cacheKey,
                    reason:
                      "Permission scope does not map to the requested namespace relation.",
                    auditRequired: false,
                  };

              return Schema.decodeUnknown(AuthorizationDecisionSchema)(
                localDecision,
              ).pipe(
                Effect.tap((validatedDecision) =>
                  Effect.sync(() => {
                    cache.set(cacheKey, {
                      decision: validatedDecision,
                      expiresAt,
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
            }

            const matchedTupleEffect =
              delegatedTupleLookup !== undefined
                ? resolveDelegatedMatchedTuple({
                    request: decodedInput,
                    subjectCandidates,
                    delegatedTupleLookup,
                  }).pipe(
                    Effect.map(
                      (matchedTuple): DelegatedMatchedTupleResolution => ({
                        matchedTuple,
                        matchedSubject: matchedTuple?.subject,
                        degradedExplainability: false,
                      }),
                    ),
                    Effect.catchAll((error) =>
                      delegatedCheck === undefined
                        ? Effect.fail(error)
                        : Effect.succeed<DelegatedMatchedTupleResolution>({
                            matchedTuple: undefined,
                            matchedSubject: undefined,
                            degradedExplainability: true,
                          }),
                    ),
                    Effect.flatMap((delegatedResolution) =>
                      delegatedResolution.matchedTuple !== undefined ||
                      delegatedCheck === undefined
                        ? Effect.succeed(delegatedResolution)
                        : resolveDelegatedMatchedSubject(
                            decodedInput,
                            subjectCandidates,
                            delegatedCheck,
                          ).pipe(
                            Effect.map((matchedSubject) => ({
                              matchedTuple: undefined,
                              matchedSubject,
                              degradedExplainability: true,
                            })),
                          ),
                    ),
                  )
                : delegatedCheck === undefined
                  ? Effect.succeed<DelegatedMatchedTupleResolution>({
                      matchedTuple: localMatchedTuple,
                      matchedSubject: localMatchedTuple?.subject,
                      degradedExplainability: false,
                    })
                  : resolveDelegatedMatchedSubject(
                      decodedInput,
                      subjectCandidates,
                      delegatedCheck,
                    ).pipe(
                      Effect.map(
                        (matchedSubject): DelegatedMatchedTupleResolution => ({
                          matchedTuple: undefined,
                          matchedSubject,
                          degradedExplainability: matchedSubject !== undefined,
                        }),
                      ),
                    );

            return matchedTupleEffect.pipe(
              Effect.flatMap((matchedResolution) => {
                const usedDelegatedCheck = delegatedCheck !== undefined;
                const resolvedSubject =
                  matchedResolution.matchedSubject ??
                  matchedResolution.matchedTuple?.subject;
                const decision =
                  matchedResolution.matchedTuple === undefined &&
                  resolvedSubject === undefined
                    ? {
                        allowed: false,
                        cacheKey,
                        reason: matchedResolution.degradedExplainability
                          ? "Access denied because persisted tuple evidence was unavailable and delegated fallback found no match."
                          : usedDelegatedCheck
                            ? "No persisted authorization relation was found."
                            : "No matching authorization tuple was found.",
                        auditRequired: actorSupportsPrivilegedSupportEscalation(
                          decodedInput.requestContext.actorType,
                        ),
                      }
                    : {
                        allowed: true,
                        cacheKey,
                        reason: matchedResolution.degradedExplainability
                          ? "Allowed via delegated authorization fallback without persisted tuple evidence."
                          : usedDelegatedCheck
                            ? "Matched persisted authorization relation."
                            : "Matched declared authorization tuple.",
                        auditRequired: actorSupportsPrivilegedSupportEscalation(
                          decodedInput.requestContext.actorType,
                        ),
                        ...(matchedResolution.matchedTuple !== undefined
                          ? { matchedTuple: matchedResolution.matchedTuple }
                          : {}),
                      };

                return Schema.decodeUnknown(AuthorizationDecisionSchema)(
                  decision,
                ).pipe(
                  Effect.tap((validatedDecision) =>
                    Effect.sync(() => {
                      cache.set(cacheKey, {
                        decision: validatedDecision,
                        expiresAt: resolveCacheExpiry({
                          now,
                          cacheTtlSeconds: options.cacheTtlSeconds,
                          breakGlassAllowed: false,
                          requestContext: decodedInput.requestContext,
                        }),
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
          }),
        );

      const explain = (checkInput: AuthorizationCheckInput) =>
        Schema.decodeUnknown(AuthorizationCheckInputSchema)(checkInput).pipe(
          Effect.flatMap((decodedInput) => {
            const subjectCandidates = buildSubjectCandidates(decodedInput);
            const localMatchedTuple = findMatchingTuple(
              tuples,
              decodedInput,
              subjectCandidates,
            );
            const usedBreakGlass = hasPrivilegedBreakGlassAccess(
              decodedInput.requestContext,
            );
            const permissionMappingAllowed = mappingAllowsRequest(decodedInput);
            const matchedSubjectEffect =
              usedBreakGlass || !permissionMappingAllowed
                ? Effect.succeed<string | undefined>(undefined)
                : delegatedTupleLookup !== undefined
                  ? resolveDelegatedMatchedTuple({
                      request: decodedInput,
                      subjectCandidates,
                      delegatedTupleLookup,
                    }).pipe(
                      Effect.catchAll((error) =>
                        delegatedCheck === undefined
                          ? Effect.fail(error)
                          : Effect.succeed<AuthorizationTuple | undefined>(
                              undefined,
                            ),
                      ),
                      Effect.flatMap((matchedTuple) =>
                        matchedTuple !== undefined ||
                        delegatedCheck === undefined
                          ? Effect.succeed(matchedTuple?.subject)
                          : resolveDelegatedMatchedSubject(
                              decodedInput,
                              subjectCandidates,
                              delegatedCheck,
                            ),
                      ),
                    )
                  : delegatedCheck === undefined
                    ? Effect.succeed(localMatchedTuple?.subject)
                    : resolveDelegatedMatchedSubject(
                        decodedInput,
                        subjectCandidates,
                        delegatedCheck,
                      );

            return matchedSubjectEffect.pipe(
              Effect.flatMap((matchedSubject) =>
                Schema.decodeUnknown(AuthorizationExplanationSchema)({
                  cacheKey: buildCacheKey(decodedInput),
                  subjectCandidates: [...subjectCandidates],
                  ...(matchedSubject !== undefined ? { matchedSubject } : {}),
                  usedBreakGlass,
                  requestScope: decodedInput.requestContext.tenant.scope,
                  requestScopeId: decodedInput.requestContext.tenant.scopeId,
                }),
              ),
            );
          }),
        );

      return {
        listTuples: Effect.succeed([...tuples]),
        check,
        explain,
      };
    }),
  );

export const makeAuthorizationModuleLayer = (
  input: AuthorizationModuleOptions,
) => Layer.effect(AuthorizationModule, makeAuthorizationModule(input));
