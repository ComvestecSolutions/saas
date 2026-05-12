import { and, desc, eq, or } from "drizzle-orm";
import { Effect, Either, ParseResult, Schema } from "effect";
import { configDefaultValue, tenantBrandingConfigKey } from "@comvestec/config";
import {
  type AuditEvent,
  actorType,
  authorizationNamespace,
  billingSubscriptionStatus,
  platformModuleId,
  platformScope,
  type PublicBrandingProjection,
  RedeemTenantInvitationRequestSchema,
  type RedeemTenantInvitationResult,
  RedeemTenantInvitationResultSchema,
  type RequestContext,
  type TenantMembershipRelation,
  type TenantMembershipView,
  tenantMembershipRelations,
  TenantMembershipViewListSchema,
  TenantMembershipViewSchema,
  tenantManagementAuditAction,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogPostgresQueryable,
  billingEntitlementsTable,
  billingPaymentEventsTable,
  BillingStatePostgresRepository,
  type BillingStatePostgresRepositoryError,
  type BillingStatePostgresQueryable,
  billingSubscriptionsTable,
  buildAuditEvent,
  type BuildAuditEventInput,
  IdentitySessionModule,
  type IdentitySessionModuleError,
  IdentitySessionPostgresRepository,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
  makeBillingStatePostgresRepository,
  makeIdentitySessionModule,
  makeIdentitySessionPostgresRepository,
  makeRuntimeConfigModule,
  makeRuntimeConfigPostgresRepository,
  makeTenantManagementModule,
  makeTenantBrandingModule,
  makeTenantInvitationPostgresRepository,
  makeTenantOnboardingPostgresRepository,
  makeTenantProvisioningPostgresRepository,
  type PersistTenantInvitationRecord,
  type PostgresDatabase,
  RuntimeConfigModule,
  type RuntimeConfigModulePersistenceError,
  runtimeConfigOverrideProposalsTable,
  runtimeConfigOverridesTable,
  type RuntimeConfigPostgresQueryable,
  runtimeConfigSyncArtifactsTable,
  TenantManagementModule,
  TenantInvitationPostgresRepository,
  TenantOnboardingPostgresRepository,
  type TenantInvitationPostgresRepositoryError,
  tenantInvitationPersistedStatus,
  tenantMembershipInvitationsTable,
  TenantProvisioningPostgresRepository,
  type UnknownConfigKeyError,
} from "@comvestec/modules";
import {
  KeycloakAdapter,
  makeKeycloakAdapter,
  makeOryKetoAdapter,
  makePostgresAdapter,
  makeValkeyAdapter,
  OryKetoAdapter,
  type OryKetoAdapterRequestError,
  type PostgresAdapterConnectionError,
  ValkeyAdapter,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";
import {
  type AdminTenantManagementRuntimeOptions,
  resolveAdminTenantManagementRuntimeOptionsFromEnvironment,
} from "./admin-tenant-management";
import {
  buildInvitationTargetTenantContext,
  buildTenantInvitationView,
  hashTenantInvitationToken,
} from "./tenant-management-invitations";

export const RedeemTenantInvitationBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  invitationToken: RedeemTenantInvitationRequestSchema.fields.invitationToken,
});

export type RedeemTenantInvitationBySessionRequest = Schema.Schema.Type<
  typeof RedeemTenantInvitationBySessionRequestSchema
>;

export type TenantInvitationRedemptionAuthenticationRequiredError = {
  readonly _tag: "TenantInvitationRedemptionAuthenticationRequiredError";
};

export type TenantInvitationRedemptionUnavailableError = {
  readonly _tag: "TenantInvitationRedemptionUnavailableError";
};

export type TenantInvitationRedemptionServiceError =
  | AuditLogModuleError
  | BillingStatePostgresRepositoryError
  | IdentitySessionModuleError
  | OryKetoAdapterRequestError
  | ParseResult.ParseError
  | RuntimeConfigModulePersistenceError
  | TenantInvitationPostgresRepositoryError
  | TenantInvitationRedemptionAuthenticationRequiredError
  | TenantInvitationRedemptionUnavailableError
  | UnknownConfigKeyError;

export type TenantInvitationRedemptionRuntimeError =
  | PostgresAdapterConnectionError
  | TenantInvitationRedemptionServiceError;

export type TenantInvitationRedemptionService = {
  readonly redeemTenantInvitation: (
    input: RedeemTenantInvitationBySessionRequest,
  ) => Effect.Effect<
    RedeemTenantInvitationResult,
    TenantInvitationRedemptionServiceError
  >;
};

type TenantInvitationRedemptionServiceOptions = {
  readonly persistRedeemedInvitation?: PersistRedeemedTenantInvitation;
};

type PersistRedeemedTenantInvitationInput = {
  readonly invitation: PersistTenantInvitationRecord;
  readonly redeemedBy: string;
  readonly redeemedAt: string;
  readonly auditInput: BuildAuditEventInput;
};

type PersistRedeemedTenantInvitation = (
  input: PersistRedeemedTenantInvitationInput,
) => Effect.Effect<
  PersistTenantInvitationRecord | undefined,
  AuditLogModuleError | TenantInvitationPostgresRepositoryError
>;

const createAuthenticationRequiredError =
  (): TenantInvitationRedemptionAuthenticationRequiredError => ({
    _tag: "TenantInvitationRedemptionAuthenticationRequiredError",
  });

const createInvitationUnavailableError =
  (): TenantInvitationRedemptionUnavailableError => ({
    _tag: "TenantInvitationRedemptionUnavailableError",
  });

const decodeTenantMembershipViewList = Schema.decodeUnknown(
  TenantMembershipViewListSchema,
);

const decodeTenantMembershipView = Schema.decodeUnknown(
  TenantMembershipViewSchema,
);

const decodeRedeemTenantInvitationResult = Schema.decodeUnknown(
  RedeemTenantInvitationResultSchema,
);

const tenantBrandingPublicProjectionConfigKeys = [
  tenantBrandingConfigKey.companyName,
  tenantBrandingConfigKey.logoAssetId,
  tenantBrandingConfigKey.faviconAssetId,
  tenantBrandingConfigKey.themePrimary,
  tenantBrandingConfigKey.themeSecondary,
  tenantBrandingConfigKey.themeAccent,
  tenantBrandingConfigKey.supportEmail,
] as const;

const isMaterializedBrandingValue = (value: unknown) =>
  value !== undefined && value !== null && value !== configDefaultValue.inherit;

const platformScopeSpecificityRank = (
  scope: RequestContext["tenant"]["scope"],
) => {
  switch (scope) {
    case platformScope.individual:
      return 0;
    case platformScope.organization:
      return 1;
    case platformScope.enterprise:
      return 2;
    case platformScope.platform:
      return 3;
  }
};

const resolveBrandingEffectiveScope = (
  scopes: readonly (RequestContext["tenant"]["scope"] | undefined)[],
) =>
  scopes.reduce<RequestContext["tenant"]["scope"]>(
    (selectedScope, scope) =>
      scope !== undefined &&
      platformScopeSpecificityRank(scope) <
        platformScopeSpecificityRank(selectedScope)
        ? scope
        : selectedScope,
    platformScope.platform,
  );

type TenantBrandingResolutionModule =
  ReturnType<typeof makeTenantBrandingModule> extends Effect.Effect<
    infer Success,
    infer _Error,
    infer _Requirements
  >
    ? Success
    : never;

const tenantMembershipRelationSortOrder = new Map<
  TenantMembershipRelation,
  number
>(tenantMembershipRelations.map((relation, index) => [relation, index]));

const sortTenantMembershipRelations = (relations: TenantMembershipRelation[]) =>
  relations.sort(
    (left, right) =>
      (tenantMembershipRelationSortOrder.get(left) ?? 0) -
      (tenantMembershipRelationSortOrder.get(right) ?? 0),
  );

const buildRedeemTenantInvitationResult = (input: {
  readonly tenant: RequestContext["tenant"];
  readonly invitationId: string;
  readonly relation: TenantMembershipRelation;
  readonly membershipChanged: boolean;
  readonly membership: TenantMembershipView;
  readonly branding: PublicBrandingProjection;
}) =>
  decodeRedeemTenantInvitationResult({
    tenant: input.tenant,
    invitationId: input.invitationId,
    relation: input.relation,
    membershipChanged: input.membershipChanged,
    membership: input.membership,
    branding: input.branding,
  });

const buildTenantScopedRequestContext = (input: {
  readonly requestContext: RequestContext;
  readonly tenant: RequestContext["tenant"];
}): RequestContext => ({
  ...input.requestContext,
  tenant: input.tenant,
});

const buildTenantInvitationMutationAuditTarget = (input: {
  readonly tenant: RequestContext["tenant"];
  readonly invitationId: string;
}) =>
  [
    input.tenant.scope,
    input.tenant.scopeId,
    "invitations",
    input.invitationId,
  ].join(":");

const buildPersistedInvitationInsertRow = (
  invitation: PersistTenantInvitationRecord,
) => ({
  invitationId: invitation.invitationId,
  tenantScope: invitation.tenantScope,
  tenantScopeId: invitation.tenantScopeId,
  tokenHash: invitation.tokenHash ?? null,
  recipientEmail: invitation.recipientEmail,
  relation: invitation.relation,
  status: invitation.status,
  issuedBy: invitation.issuedBy,
  correlationId: invitation.correlationId ?? null,
  issuedAt: new Date(invitation.issuedAt ?? new Date().toISOString()),
  expiresAt: new Date(invitation.expiresAt),
  redeemedAt:
    invitation.redeemedAt === undefined
      ? null
      : new Date(invitation.redeemedAt),
  redeemedBy: invitation.redeemedBy ?? null,
  revokedAt:
    invitation.revokedAt === undefined ? null : new Date(invitation.revokedAt),
  revokedBy: invitation.revokedBy ?? null,
});

const buildAuditEventInsertRow = (event: AuditEvent) => ({
  eventId: event.eventId,
  moduleId: event.moduleId,
  action: event.action,
  target: event.target,
  actorId: event.actorId,
  tenantScope: event.tenantScope,
  tenantScopeId: event.tenantScopeId,
  reason: event.reason ?? null,
  correlationId: event.correlationId ?? null,
  requestContext: {},
});

const isRedeemedInvitationTransactionError = (
  cause: unknown,
): cause is
  | Extract<
      AuditLogModuleError,
      { readonly _tag: "AuditLogPostgresRepositoryPersistenceError" }
    >
  | Extract<
      TenantInvitationPostgresRepositoryError,
      { readonly _tag: "TenantInvitationPostgresRepositoryPersistenceError" }
    > =>
  typeof cause === "object" &&
  cause !== null &&
  "_tag" in cause &&
  (cause._tag === "AuditLogPostgresRepositoryPersistenceError" ||
    cause._tag === "TenantInvitationPostgresRepositoryPersistenceError");

const createPersistRedeemedTenantInvitation =
  (writeDatabase: PostgresDatabase): PersistRedeemedTenantInvitation =>
  (input) =>
    buildAuditEvent(input.auditInput).pipe(
      Effect.flatMap((auditEvent) =>
        Effect.tryPromise({
          try: async () => {
            const auditRow = buildAuditEventInsertRow(auditEvent);

            return await writeDatabase.transaction(async (tx) => {
              let updatedRows: Array<{ invitationId: string }> = [];

              try {
                updatedRows = await tx
                  .update(tenantMembershipInvitationsTable)
                  .set({
                    status: tenantInvitationPersistedStatus.redeemed,
                    redeemedBy: input.redeemedBy,
                    redeemedAt: new Date(input.redeemedAt),
                  })
                  .where(
                    and(
                      eq(
                        tenantMembershipInvitationsTable.tenantScope,
                        input.invitation.tenantScope,
                      ),
                      eq(
                        tenantMembershipInvitationsTable.tenantScopeId,
                        input.invitation.tenantScopeId,
                      ),
                      eq(
                        tenantMembershipInvitationsTable.invitationId,
                        input.invitation.invitationId,
                      ),
                      eq(
                        tenantMembershipInvitationsTable.status,
                        tenantInvitationPersistedStatus.pending,
                      ),
                    ),
                  )
                  .returning();
              } catch (cause) {
                throw {
                  _tag: "TenantInvitationPostgresRepositoryPersistenceError",
                  operation: "redeemInvitation",
                  cause,
                } satisfies Extract<
                  TenantInvitationPostgresRepositoryError,
                  {
                    readonly _tag: "TenantInvitationPostgresRepositoryPersistenceError";
                  }
                >;
              }

              if (updatedRows.length === 0) {
                return undefined;
              }

              try {
                await tx.insert(auditLogEventsTable).values(auditRow).execute();
              } catch (cause) {
                throw {
                  _tag: "AuditLogPostgresRepositoryPersistenceError",
                  operation: "insertAuditEvent",
                  cause,
                } satisfies Extract<
                  AuditLogModuleError,
                  {
                    readonly _tag: "AuditLogPostgresRepositoryPersistenceError";
                  }
                >;
              }

              return {
                ...input.invitation,
                status: tenantInvitationPersistedStatus.redeemed,
                redeemedBy: input.redeemedBy,
                redeemedAt: input.redeemedAt,
              } satisfies PersistTenantInvitationRecord;
            });
          },
          catch: (cause) =>
            isRedeemedInvitationTransactionError(cause)
              ? cause
              : ({
                  _tag: "TenantInvitationPostgresRepositoryPersistenceError",
                  operation: "redeemInvitation",
                  cause,
                } satisfies Extract<
                  TenantInvitationPostgresRepositoryError,
                  {
                    readonly _tag: "TenantInvitationPostgresRepositoryPersistenceError";
                  }
                >),
        }),
      ),
    );

const missingRedeemedInvitationPersistence: PersistRedeemedTenantInvitation =
  () =>
    Effect.die(
      new Error(
        "Transactional tenant invitation persistence is required before invitation redemption workflows can run.",
      ),
    );

const resolveRedeemTenantInvitationBranding = (input: {
  readonly billingState: Pick<
    BillingStatePostgresRepository["Type"],
    "getTenantAccessState"
  >;
  readonly runtimeConfig: Pick<
    RuntimeConfigModule["Type"],
    "listOverridesByModule" | "resolveConfigValue"
  >;
  readonly tenantBranding: Pick<
    TenantBrandingResolutionModule,
    "resolveBranding"
  >;
  readonly requestContext: RequestContext;
}) =>
  Effect.gen(function* () {
    const tenantAccessState = yield* input.billingState.getTenantAccessState(
      input.requestContext.tenant,
    );
    const overrides = yield* input.runtimeConfig.listOverridesByModule(
      platformModuleId.tenantBranding,
    );
    const resolutions = yield* Effect.forEach(
      tenantBrandingPublicProjectionConfigKeys,
      (key) =>
        input.runtimeConfig
          .resolveConfigValue({
            requestContext: input.requestContext,
            moduleId: platformModuleId.tenantBranding,
            key,
            overrides,
            entitlements: tenantAccessState.entitlements,
          })
          .pipe(Effect.map((resolution) => [key, resolution] as const)),
      { concurrency: 1 },
    );
    const materializedResolutions = resolutions.filter(([, resolution]) =>
      isMaterializedBrandingValue(resolution.effectiveValue),
    );
    const resolvedProjection = (yield* input.tenantBranding.resolveBranding({
      requestContext: input.requestContext,
      entitled: resolutions.some(([, resolution]) => resolution.entitled),
      values: Object.fromEntries(
        materializedResolutions.map(([key, resolution]) => [
          key,
          resolution.effectiveValue,
        ]),
      ),
    })).publicProjection;

    return {
      ...resolvedProjection,
      effectiveScope: resolveBrandingEffectiveScope(
        materializedResolutions.map(
          ([, resolution]) => resolution.resolvedScope,
        ),
      ),
    } satisfies PublicBrandingProjection;
  });

const resolveFallbackRedeemTenantInvitationBranding = (input: {
  readonly tenantBranding: Pick<
    TenantBrandingResolutionModule,
    "resolveBranding"
  >;
  readonly requestContext: RequestContext;
}) =>
  input.tenantBranding
    .resolveBranding({
      requestContext: input.requestContext,
      entitled: false,
      values: {},
    })
    .pipe(
      Effect.map((branding) => ({
        ...branding.publicProjection,
        effectiveScope: platformScope.platform,
      })),
      Effect.orDie,
    );

const resolveSuccessfulRedeemTenantInvitationBranding = (input: {
  readonly billingState: Pick<
    BillingStatePostgresRepository["Type"],
    "getTenantAccessState"
  >;
  readonly runtimeConfig: Pick<
    RuntimeConfigModule["Type"],
    "listOverridesByModule" | "resolveConfigValue"
  >;
  readonly tenantBranding: Pick<
    TenantBrandingResolutionModule,
    "resolveBranding"
  >;
  readonly requestContext: RequestContext;
}) =>
  resolveRedeemTenantInvitationBranding(input).pipe(
    Effect.catchAll(() =>
      resolveFallbackRedeemTenantInvitationBranding({
        tenantBranding: input.tenantBranding,
        requestContext: input.requestContext,
      }),
    ),
  );

const loadTenantMembershipTuples = (input: {
  readonly oryKeto: Pick<OryKetoAdapter["Type"], "listTuples">;
  readonly tenant: RequestContext["tenant"];
  readonly subject: string;
}) =>
  Effect.forEach(
    tenantMembershipRelations,
    (relation) =>
      input.oryKeto
        .listTuples({
          namespace: authorizationNamespace.tenant,
          object: input.tenant.scopeId,
          relation,
          subject: input.subject,
        })
        .pipe(
          Effect.map((relationTuples) =>
            relationTuples.map((tuple) => ({
              subject: tuple.subject,
              relation,
            })),
          ),
        ),
    { concurrency: 1 },
  ).pipe(Effect.map((tupleGroups) => tupleGroups.flat()));

const buildTenantMembershipViewList = (input: {
  readonly tuples: ReadonlyArray<{
    readonly subject: string;
    readonly relation: TenantMembershipRelation;
  }>;
}) => {
  const relationsBySubject = new Map<string, Set<TenantMembershipRelation>>();

  for (const tuple of input.tuples) {
    const existingRelations = relationsBySubject.get(tuple.subject);

    if (existingRelations === undefined) {
      relationsBySubject.set(tuple.subject, new Set([tuple.relation]));
      continue;
    }

    existingRelations.add(tuple.relation);
  }

  return decodeTenantMembershipViewList(
    [...relationsBySubject.entries()]
      .map(([subject, relations]) => ({
        subject,
        relations: sortTenantMembershipRelations([...relations]),
      }))
      .sort((left, right) => left.subject.localeCompare(right.subject)),
  );
};

const readTenantMembershipView = (input: {
  readonly oryKeto: Pick<OryKetoAdapter["Type"], "listTuples">;
  readonly tenant: RequestContext["tenant"];
  readonly subject: string;
}) =>
  loadTenantMembershipTuples(input).pipe(
    Effect.flatMap((tuples) => buildTenantMembershipViewList({ tuples })),
    Effect.flatMap((memberships) =>
      decodeTenantMembershipView(
        memberships.find(
          (membership) => membership.subject === input.subject,
        ) ?? {
          subject: input.subject,
          relations: [],
        },
      ),
    ),
  );

type TenantInvitationMembershipResult = {
  readonly membershipChanged: boolean;
  readonly membership: TenantMembershipView;
};

const rollbackGrantedTenantMembership = (input: {
  readonly oryKeto: Pick<OryKetoAdapter["Type"], "deleteTuple">;
  readonly tenant: RequestContext["tenant"];
  readonly subject: string;
  readonly relation: TenantMembershipRelation;
  readonly membershipChanged: boolean;
}) =>
  !input.membershipChanged
    ? Effect.void
    : input.oryKeto
        .deleteTuple({
          namespace: authorizationNamespace.tenant,
          object: input.tenant.scopeId,
          relation: input.relation,
          subject: input.subject,
        })
        .pipe(Effect.asVoid);

const recoverRedeemedInvitationResult = (input: {
  readonly invitationRepository: Pick<
    TenantInvitationPostgresRepository["Type"],
    "getInvitationById"
  >;
  readonly tenant: RequestContext["tenant"];
  readonly invitationRecord: PersistTenantInvitationRecord;
  readonly actorId: string;
  readonly membership: TenantMembershipView;
  readonly resolveBranding: () => Effect.Effect<
    PublicBrandingProjection,
    never
  >;
  readonly now: Date;
}) =>
  Effect.gen(function* () {
    const currentInvitationRecord =
      yield* input.invitationRepository.getInvitationById({
        tenantScope: input.invitationRecord.tenantScope,
        tenantScopeId: input.invitationRecord.tenantScopeId,
        invitationId: input.invitationRecord.invitationId,
      });

    if (currentInvitationRecord === undefined) {
      return undefined;
    }

    const currentInvitation = yield* buildTenantInvitationView({
      record: currentInvitationRecord,
      now: input.now,
    });

    if (
      currentInvitation.status !== "redeemed" ||
      currentInvitationRecord.redeemedBy !== input.actorId
    ) {
      return undefined;
    }

    if (
      !input.membership.relations.includes(currentInvitationRecord.relation)
    ) {
      return undefined;
    }

    const branding = yield* input.resolveBranding();

    return yield* buildRedeemTenantInvitationResult({
      tenant: input.tenant,
      invitationId: currentInvitationRecord.invitationId,
      relation: currentInvitationRecord.relation,
      membershipChanged: false,
      membership: input.membership,
      branding,
    });
  });

const ensureTenantMembership = (input: {
  readonly oryKeto: Pick<OryKetoAdapter["Type"], "listTuples" | "writeTuple">;
  readonly tenant: RequestContext["tenant"];
  readonly subject: string;
  readonly relation: TenantMembershipRelation;
}): Effect.Effect<
  TenantInvitationMembershipResult,
  OryKetoAdapterRequestError | ParseResult.ParseError
> =>
  Effect.gen(function* () {
    const currentMembership = yield* readTenantMembershipView({
      oryKeto: input.oryKeto,
      tenant: input.tenant,
      subject: input.subject,
    });

    if (currentMembership.relations.includes(input.relation)) {
      return {
        membershipChanged: false,
        membership: currentMembership,
      } satisfies TenantInvitationMembershipResult;
    }

    yield* input.oryKeto.writeTuple({
      namespace: authorizationNamespace.tenant,
      object: input.tenant.scopeId,
      relation: input.relation,
      subject: input.subject,
    });

    return {
      membershipChanged: true,
      membership: {
        subject: input.subject,
        relations: sortTenantMembershipRelations([
          ...currentMembership.relations,
          input.relation,
        ]),
      },
    } satisfies TenantInvitationMembershipResult;
  });

export const makeTenantInvitationRedemptionService = (
  options: TenantInvitationRedemptionServiceOptions = {},
) =>
  Effect.gen(function* () {
    const billingState = yield* BillingStatePostgresRepository;
    const identitySession = yield* IdentitySessionModule;
    const invitationRepository = yield* TenantInvitationPostgresRepository;
    const oryKeto = yield* OryKetoAdapter;
    const runtimeConfig = yield* RuntimeConfigModule;
    const tenantBranding = yield* makeTenantBrandingModule();
    const persistRedeemedInvitation =
      options.persistRedeemedInvitation ?? missingRedeemedInvitationPersistence;

    return {
      redeemTenantInvitation: (input: RedeemTenantInvitationBySessionRequest) =>
        Schema.decodeUnknown(RedeemTenantInvitationBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const invitationToken = request.invitationToken.trim();

              if (invitationToken.length === 0) {
                return yield* Effect.fail(createInvitationUnavailableError());
              }

              const requestContext =
                yield* identitySession.resolveRequestContext({
                  sessionId: request.sessionId,
                });

              if (
                requestContext.actorType === actorType.anonymous ||
                requestContext.actorId === undefined
              ) {
                return yield* Effect.fail(createAuthenticationRequiredError());
              }

              const actorId = requestContext.actorId;

              const tokenHash =
                yield* hashTenantInvitationToken(invitationToken);
              const invitationRecord =
                yield* invitationRepository.getInvitationByTokenHash({
                  tokenHash,
                });

              if (invitationRecord === undefined) {
                return yield* Effect.fail(createInvitationUnavailableError());
              }

              const tenant = buildInvitationTargetTenantContext({
                scope: invitationRecord.tenantScope,
                scopeId: invitationRecord.tenantScopeId,
              });
              const tenantRequestContext = buildTenantScopedRequestContext({
                requestContext,
                tenant,
              });
              const now = new Date();
              const invitation = yield* buildTenantInvitationView({
                record: invitationRecord,
                now,
              });

              if (invitation.status === "redeemed") {
                if (invitationRecord.redeemedBy !== actorId) {
                  return yield* Effect.fail(createInvitationUnavailableError());
                }

                const membership = yield* readTenantMembershipView({
                  oryKeto,
                  tenant,
                  subject: actorId,
                });

                if (!membership.relations.includes(invitationRecord.relation)) {
                  return yield* Effect.fail(createInvitationUnavailableError());
                }

                const branding =
                  yield* resolveSuccessfulRedeemTenantInvitationBranding({
                    billingState,
                    runtimeConfig,
                    tenantBranding,
                    requestContext: tenantRequestContext,
                  });

                return yield* Schema.decodeUnknown(
                  RedeemTenantInvitationResultSchema,
                )({
                  tenant,
                  invitationId: invitationRecord.invitationId,
                  relation: invitationRecord.relation,
                  membershipChanged: false,
                  membership,
                  branding,
                });
              }

              if (invitation.status !== "pending") {
                return yield* Effect.fail(createInvitationUnavailableError());
              }

              const membershipState = yield* ensureTenantMembership({
                oryKeto,
                tenant,
                subject: actorId,
                relation: invitationRecord.relation,
              });

              const persistedRedemption = yield* Effect.either(
                persistRedeemedInvitation({
                  invitation: invitationRecord,
                  redeemedBy: actorId,
                  redeemedAt: now.toISOString(),
                  auditInput: {
                    requestContext: tenantRequestContext,
                    moduleId: platformModuleId.tenantManagement,
                    action: tenantManagementAuditAction.invitationRedeemed,
                    target: buildTenantInvitationMutationAuditTarget({
                      tenant,
                      invitationId: invitationRecord.invitationId,
                    }),
                  },
                }),
              );

              if (Either.isLeft(persistedRedemption)) {
                const recoveredResult = yield* recoverRedeemedInvitationResult({
                  invitationRepository,
                  tenant,
                  invitationRecord,
                  actorId,
                  membership: membershipState.membership,
                  resolveBranding: () =>
                    resolveSuccessfulRedeemTenantInvitationBranding({
                      billingState,
                      runtimeConfig,
                      tenantBranding,
                      requestContext: tenantRequestContext,
                    }),
                  now,
                });

                if (recoveredResult !== undefined) {
                  return recoveredResult;
                }

                yield* rollbackGrantedTenantMembership({
                  oryKeto,
                  tenant,
                  subject: actorId,
                  relation: invitationRecord.relation,
                  membershipChanged: membershipState.membershipChanged,
                });

                return yield* Effect.fail(persistedRedemption.left);
              }

              const redeemedRecord = persistedRedemption.right;

              if (redeemedRecord === undefined) {
                const recoveredResult = yield* recoverRedeemedInvitationResult({
                  invitationRepository,
                  tenant,
                  invitationRecord,
                  actorId,
                  membership: membershipState.membership,
                  resolveBranding: () =>
                    resolveSuccessfulRedeemTenantInvitationBranding({
                      billingState,
                      runtimeConfig,
                      tenantBranding,
                      requestContext: tenantRequestContext,
                    }),
                  now,
                });

                if (recoveredResult !== undefined) {
                  return recoveredResult;
                }

                yield* rollbackGrantedTenantMembership({
                  oryKeto,
                  tenant,
                  subject: actorId,
                  relation: invitationRecord.relation,
                  membershipChanged: membershipState.membershipChanged,
                });

                return yield* Effect.fail(createInvitationUnavailableError());
              }

              if (redeemedRecord.redeemedBy !== actorId) {
                yield* rollbackGrantedTenantMembership({
                  oryKeto,
                  tenant,
                  subject: actorId,
                  relation: invitationRecord.relation,
                  membershipChanged: membershipState.membershipChanged,
                });

                return yield* Effect.fail(createInvitationUnavailableError());
              }

              const branding =
                yield* resolveSuccessfulRedeemTenantInvitationBranding({
                  billingState,
                  runtimeConfig,
                  tenantBranding,
                  requestContext: tenantRequestContext,
                });

              return yield* buildRedeemTenantInvitationResult({
                tenant,
                invitationId: invitationRecord.invitationId,
                relation: invitationRecord.relation,
                membershipChanged: membershipState.membershipChanged,
                membership: membershipState.membership,
                branding,
              });
            }),
          ),
        ),
    } satisfies TenantInvitationRedemptionService;
  });

const makeTenantInvitationRedemptionRuntime = (
  options: AdminTenantManagementRuntimeOptions,
) =>
  Effect.gen(function* () {
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
    const keycloak = yield* makeKeycloakAdapter({
      baseUrl: options.keycloakBaseUrl,
      realm: options.keycloakRealm,
      clientId: options.keycloakClientId,
      clientSecret: options.keycloakClientSecret,
    });
    const valkey = yield* makeValkeyAdapter({ url: options.valkeyUrl });
    const oryKeto = yield* makeOryKetoAdapter({
      readUrl: options.ketoReadUrl,
      writeUrl: options.ketoWriteUrl,
    });
    const tenantManagement = yield* makeTenantManagementModule();
    const writeDatabase = buildWriteDatabase(postgres.database);
    const identityRepository =
      yield* makeIdentitySessionPostgresRepository(writeDatabase);
    const identitySessionRepository = identityRepository;
    const runtimeConfigQueryable: RuntimeConfigPostgresQueryable = {
      listOverridesByModule: (moduleId) =>
        postgres.database
          .select()
          .from(runtimeConfigOverridesTable)
          .where(eq(runtimeConfigOverridesTable.moduleId, moduleId))
          .orderBy(desc(runtimeConfigOverridesTable.changedAt)),
      listOverrideProposalsByModule: (moduleId) =>
        postgres.database
          .select()
          .from(runtimeConfigOverrideProposalsTable)
          .where(eq(runtimeConfigOverrideProposalsTable.moduleId, moduleId))
          .orderBy(desc(runtimeConfigOverrideProposalsTable.changedAt)),
      listSyncArtifactsByModule: (moduleId) =>
        postgres.database
          .select()
          .from(runtimeConfigSyncArtifactsTable)
          .where(eq(runtimeConfigSyncArtifactsTable.moduleId, moduleId))
          .orderBy(desc(runtimeConfigSyncArtifactsTable.generatedAt)),
    };
    const runtimeConfigRepository = yield* makeRuntimeConfigPostgresRepository({
      ...writeDatabase,
      ...runtimeConfigQueryable,
    });
    const runtimeConfig = yield* makeRuntimeConfigModule(
      runtimeConfigRepository,
    );
    const invitationRepository =
      yield* makeTenantInvitationPostgresRepository(writeDatabase);
    const onboardingRepository =
      yield* makeTenantOnboardingPostgresRepository(writeDatabase);
    const tenantProvisioningRepository =
      yield* makeTenantProvisioningPostgresRepository(writeDatabase);
    const billingStateQueryable: BillingStatePostgresQueryable = {
      listEntitlementsByScope: async (scope, scopeId) =>
        postgres.database
          .select()
          .from(billingEntitlementsTable)
          .where(
            and(
              eq(billingEntitlementsTable.scope, scope),
              eq(billingEntitlementsTable.scopeId, scopeId),
              eq(billingEntitlementsTable.active, true),
            ),
          ),
      listPaymentEventsByScope: (scope, scopeId) =>
        postgres.database
          .select()
          .from(billingPaymentEventsTable)
          .where(
            and(
              eq(billingPaymentEventsTable.scope, scope),
              eq(billingPaymentEventsTable.scopeId, scopeId),
            ),
          )
          .orderBy(desc(billingPaymentEventsTable.recordedAt)),
      getLatestSubscriptionByScope: async (scope, scopeId) => {
        const liveRows = await postgres.database
          .select()
          .from(billingSubscriptionsTable)
          .where(
            and(
              eq(billingSubscriptionsTable.scope, scope),
              eq(billingSubscriptionsTable.scopeId, scopeId),
              or(
                eq(
                  billingSubscriptionsTable.status,
                  billingSubscriptionStatus.pending,
                ),
                eq(
                  billingSubscriptionsTable.status,
                  billingSubscriptionStatus.active,
                ),
                eq(
                  billingSubscriptionsTable.status,
                  billingSubscriptionStatus.pastDue,
                ),
              ),
            ),
          )
          .orderBy(desc(billingSubscriptionsTable.updatedAt))
          .limit(1);

        if (liveRows[0] !== undefined) {
          return liveRows[0];
        }

        const rows = await postgres.database
          .select()
          .from(billingSubscriptionsTable)
          .where(
            and(
              eq(billingSubscriptionsTable.scope, scope),
              eq(billingSubscriptionsTable.scopeId, scopeId),
            ),
          )
          .orderBy(desc(billingSubscriptionsTable.updatedAt))
          .limit(1);

        return rows[0];
      },
    };
    const billingState = yield* makeBillingStatePostgresRepository(
      billingStateQueryable,
    );
    const auditLogQueryable: AuditLogPostgresQueryable = {
      listEventsByModule: async (moduleId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.moduleId, moduleId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTarget: async (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.moduleId, input.moduleId),
              eq(auditLogEventsTable.target, input.target),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByActor: async (actorId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.actorId, actorId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTenant: async (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.tenantScope, input.tenantScope),
              eq(auditLogEventsTable.tenantScopeId, input.tenantScopeId),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
    };
    const auditLogRepository = yield* makeAuditLogPostgresRepository({
      ...writeDatabase,
      ...auditLogQueryable,
    });
    const auditLog = yield* makeAuditLogModule(auditLogRepository);
    const identitySession = yield* makeIdentitySessionModule().pipe(
      Effect.provideService(KeycloakAdapter, keycloak),
      Effect.provideService(OryKetoAdapter, oryKeto),
      Effect.provideService(ValkeyAdapter, valkey),
      Effect.provideService(
        TenantProvisioningPostgresRepository,
        tenantProvisioningRepository,
      ),
      Effect.provideService(
        TenantOnboardingPostgresRepository,
        onboardingRepository,
      ),
      Effect.provideService(
        IdentitySessionPostgresRepository,
        identitySessionRepository,
      ),
      Effect.provideService(TenantManagementModule, tenantManagement),
    );
    const service = yield* makeTenantInvitationRedemptionService({
      persistRedeemedInvitation:
        createPersistRedeemedTenantInvitation(writeDatabase),
    }).pipe(
      Effect.provideService(AuditLogModule, auditLog),
      Effect.provideService(BillingStatePostgresRepository, billingState),
      Effect.provideService(IdentitySessionModule, identitySession),
      Effect.provideService(OryKetoAdapter, oryKeto),
      Effect.provideService(RuntimeConfigModule, runtimeConfig),
      Effect.provideService(
        TenantInvitationPostgresRepository,
        invitationRepository,
      ),
    );

    return {
      service,
      close: Effect.all([
        Effect.ignore(postgres.close),
        Effect.ignore(valkey.close),
      ]).pipe(Effect.asVoid),
    };
  });

const runTenantInvitationRedemptionWithResolvedOptions = <A, E>(
  options: AdminTenantManagementRuntimeOptions,
  use: (service: TenantInvitationRedemptionService) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeTenantInvitationRedemptionRuntime(options);

    return yield* Effect.ensuring(use(runtime.service), runtime.close);
  });

export const runTenantInvitationRedemptionFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: TenantInvitationRedemptionService) => Effect.Effect<A, E>,
) =>
  resolveAdminTenantManagementRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      runTenantInvitationRedemptionWithResolvedOptions(options, use),
    ),
  );
