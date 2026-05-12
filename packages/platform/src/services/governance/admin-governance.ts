import { and, desc, eq } from "drizzle-orm";
import { Effect, ParseResult, Schema } from "effect";
import { configDefaultValue, findModuleManifest } from "@comvestec/config";
import {
  AuthorizationNamespaceSchema,
  AuthorizationRelationSchema,
  ActorTypeSchema,
  actorType,
  auditLogAuditAction,
  AuditActionSchema,
  authorizationAuditAction,
  configSchemaType,
  type ConfigKeyDeclaration,
  DeclaredModuleFeatureFlagKeySchema,
  DeclaredRuntimeGovernedKeySchema,
  fieldSecurityAuditAction,
  FeatureFlagLifecycleSchema,
  IsoTimestampSchema,
  type AuditEvent,
  type FeatureFlagDeclaration,
  featureFlagLifecycle,
  PersistedConfigSourceSchema,
  type PlatformModuleId,
  PlatformModuleIdSchema,
  platformModuleId,
  PlatformScopeSchema,
  type ProjectionDescriptor,
  projectionProfile,
  type RequestContext,
  RequestContextSchema,
  RuntimeChangeProposalActionSchema,
  RuntimeResolutionSourceSchema,
  runtimeConfigAuditAction,
  runtimeResolutionSource,
} from "@comvestec/contracts";
import {
  makeAuthorizationModule,
  type AuthorizationCheckInput,
  AuthorizationCheckInputSchema,
  type AuthorizationDelegatedCheckError,
  type AuthorizationDecision,
  type AuthorizationExplanation,
  type AuthorizationModuleService,
  makeFieldSecurityModule,
  type FieldSecurityModuleService,
  resolveIdentitySessionRequestContext,
} from "../../../../modules/src/access";
import {
  type AuditLogModuleService,
  buildAuditEvent,
  makeAuditLogModule,
  RuntimeConfigModule,
  type RuntimeConfigModuleService,
  type RuntimeConfigModulePersistenceError,
  makeRuntimeConfigModule,
} from "../../../../modules/src/governance";
import {
  auditLogEventsTable,
  AuditLogPostgresRepository,
  type AuditLogPostgresQueryable,
  type AuditLogPostgresRepositoryError,
  makeAuditLogPostgresRepository,
  makeRuntimeConfigPostgresRepository,
  RuntimeConfigProposalDecisionStatusSchema,
  RuntimeConfigOverrideRecordSchema,
  type RuntimeConfigOverrideProposalNotFoundError,
  type RuntimeConfigOverrideProposalRecord,
  RuntimeConfigOverrideProposalRecordSchema,
  RuntimeConfigOverrideProposalSubmitRecordSchema,
  RuntimeConfigSyncArtifactRecordSchema,
  RuntimeConfigSyncArtifactReviewRecordSchema,
  RuntimeConfigSyncArtifactStatusSchema,
  runtimeConfigSyncArtifactStatus,
  runtimeConfigOverrideProposalsTable,
  runtimeConfigOverridesTable,
  runtimeConfigSyncArtifactsTable,
  type RuntimeConfigOverrideRecord,
  type RuntimeConfigPostgresQueryable,
  type RuntimeConfigSyncArtifactRecord,
} from "../../../../modules/src/persistence/postgres/governance";
import {
  type BillingStatePostgresRepositoryError,
  BillingStatePostgresRepository,
  type BillingStatePostgresQueryable,
  makeBillingStatePostgresRepository,
} from "../../../../modules/src/persistence/postgres/domains/billing-state-repository";
import {
  billingEntitlementsTable,
  billingPaymentEventsTable,
  billingSubscriptionsTable,
} from "../../../../modules/src/persistence/postgres/domains/billing";
import {
  makeOryKetoAdapter,
  makePostgresAdapter,
  makeUnleashAdapter,
  makeValkeyAdapter,
  type OryKetoAdapterRequestError,
  type OryKetoTuple,
  type PostgresAdapterConnectionError,
  ValkeyAdapter,
  type ValkeyAdapterOperationError,
} from "../../adapters";
import {
  createOryKetoAuthorizationDelegatedCheck,
  createOryKetoAuthorizationDelegatedTupleLookup,
} from "../access/authorization-delegation";
import { makeRuntimeFeatureFlagRollout } from "./runtime-feature-flag-rollout";
import { buildWriteDatabase } from "../postgres-write-database";

export const AdminGovernanceRuntimeOptionsSchema = Schema.Struct({
  postgresUrl: Schema.NonEmptyString,
  valkeyUrl: Schema.NonEmptyString,
  unleashUrl: Schema.NonEmptyString,
  unleashApiKey: Schema.NonEmptyString,
  ketoReadUrl: Schema.NonEmptyString,
  ketoWriteUrl: Schema.NonEmptyString,
});

export type AdminGovernanceRuntimeOptions = Schema.Schema.Type<
  typeof AdminGovernanceRuntimeOptionsSchema
>;

const AdminGovernanceProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  VALKEY_URL: Schema.NonEmptyString,
  UNLEASH_URL: Schema.NonEmptyString,
  UNLEASH_API_KEY: Schema.NonEmptyString,
  KETO_READ_URL: Schema.NonEmptyString,
  KETO_WRITE_URL: Schema.NonEmptyString,
});

const AdminGovernanceSessionLookupSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export type AdminGovernanceSessionLookup = Schema.Schema.Type<
  typeof AdminGovernanceSessionLookupSchema
>;

export const AdminGovernanceListByModuleRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  moduleId: PlatformModuleIdSchema,
});

export const AdminGovernanceReadBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
});

export const AdminGovernanceQueryAuditEventsByTargetRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    moduleId: PlatformModuleIdSchema,
    target: Schema.NonEmptyString,
  });

export const AdminGovernanceQueryAuditEventsByActorRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    actorId: Schema.NonEmptyString,
  });

export const AdminGovernanceQueryAuditEventsByTenantRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    tenantScope: PlatformScopeSchema,
    tenantScopeId: Schema.NonEmptyString,
  });

export const AdminGovernanceAuditExportFilterSchema = Schema.Struct({
  moduleId: Schema.optional(PlatformModuleIdSchema),
  actorId: Schema.optional(Schema.NonEmptyString),
  tenantScope: Schema.optional(PlatformScopeSchema),
  tenantScopeId: Schema.optional(Schema.NonEmptyString),
  target: Schema.optional(Schema.NonEmptyString),
  recordedBefore: Schema.optional(Schema.NonEmptyString),
});

export type AdminGovernanceAuditExportFilter = Schema.Schema.Type<
  typeof AdminGovernanceAuditExportFilterSchema
>;

export const AdminGovernanceExportAuditEventsRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  filter: AdminGovernanceAuditExportFilterSchema,
});

export type AdminGovernanceReadBySessionRequest = Schema.Schema.Type<
  typeof AdminGovernanceReadBySessionRequestSchema
>;

export type AdminGovernanceQueryAuditEventsByTargetRequest = Schema.Schema.Type<
  typeof AdminGovernanceQueryAuditEventsByTargetRequestSchema
>;

export type AdminGovernanceQueryAuditEventsByActorRequest = Schema.Schema.Type<
  typeof AdminGovernanceQueryAuditEventsByActorRequestSchema
>;

export type AdminGovernanceQueryAuditEventsByTenantRequest = Schema.Schema.Type<
  typeof AdminGovernanceQueryAuditEventsByTenantRequestSchema
>;

export type AdminGovernanceExportAuditEventsRequest = Schema.Schema.Type<
  typeof AdminGovernanceExportAuditEventsRequestSchema
>;

export const AdminGovernanceInspectAuthorizationRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  checkInput: AuthorizationCheckInputSchema,
});

export type AdminGovernanceInspectAuthorizationRequest = Schema.Schema.Type<
  typeof AdminGovernanceInspectAuthorizationRequestSchema
>;

const InspectAuthorizationCommandSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  checkInput: AuthorizationCheckInputSchema,
});

type InspectAuthorizationCommand = Schema.Schema.Type<
  typeof InspectAuthorizationCommandSchema
>;

export const AdminGovernanceRuntimeConfigOverrideViewSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  key: DeclaredRuntimeGovernedKeySchema,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  value: Schema.Unknown,
  source: PersistedConfigSourceSchema,
  changedBy: Schema.NonEmptyString,
  changedAt: Schema.NonEmptyString,
  approvalReason: Schema.optional(Schema.NonEmptyString),
});

export type AdminGovernanceRuntimeConfigOverrideView = Schema.Schema.Type<
  typeof AdminGovernanceRuntimeConfigOverrideViewSchema
>;

export const AdminGovernanceRuntimeConfigOverrideViewListSchema = Schema.Array(
  AdminGovernanceRuntimeConfigOverrideViewSchema,
);

export const AdminGovernanceFeatureFlagViewSchema = Schema.Struct({
  key: DeclaredModuleFeatureFlagKeySchema,
  description: Schema.NonEmptyString,
  owner: PlatformModuleIdSchema,
  purpose: Schema.NonEmptyString,
  defaultEnabled: Schema.Boolean,
  effectiveState: Schema.Boolean,
  source: RuntimeResolutionSourceSchema,
  entitled: Schema.Boolean,
  dependencies: Schema.Array(DeclaredModuleFeatureFlagKeySchema),
  lifecycle: FeatureFlagLifecycleSchema,
  retirementPlan: Schema.NonEmptyString,
  scope: Schema.optional(PlatformScopeSchema),
});

export type AdminGovernanceFeatureFlagView = Schema.Schema.Type<
  typeof AdminGovernanceFeatureFlagViewSchema
>;

export const AdminGovernanceFeatureFlagViewListSchema = Schema.Array(
  AdminGovernanceFeatureFlagViewSchema,
);

export const AdminGovernanceRuntimeConfigProposalViewSchema = Schema.Struct({
  proposalId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
  key: DeclaredRuntimeGovernedKeySchema,
  scope: Schema.optional(PlatformScopeSchema),
  scopeId: Schema.optional(Schema.NonEmptyString),
  value: Schema.optional(Schema.Unknown),
  source: Schema.optional(PersistedConfigSourceSchema),
  changedBy: Schema.optional(Schema.NonEmptyString),
  changedAt: Schema.optional(Schema.NonEmptyString),
  approvalReason: Schema.optional(Schema.NonEmptyString),
  action: Schema.optional(RuntimeChangeProposalActionSchema),
  artifactPath: Schema.optional(Schema.NonEmptyString),
  runtimeValue: Schema.optional(Schema.Unknown),
  codeValue: Schema.optional(Schema.Unknown),
  status: RuntimeConfigSyncArtifactStatusSchema,
  generatedAt: Schema.optional(Schema.NonEmptyString),
  decidedBy: Schema.optional(Schema.NonEmptyString),
  decisionReason: Schema.optional(Schema.NonEmptyString),
  decidedAt: Schema.optional(Schema.NonEmptyString),
});

export type AdminGovernanceRuntimeConfigProposalView = Schema.Schema.Type<
  typeof AdminGovernanceRuntimeConfigProposalViewSchema
>;

export const AdminGovernanceRuntimeConfigProposalViewListSchema = Schema.Array(
  AdminGovernanceRuntimeConfigProposalViewSchema,
);

export const AdminGovernanceAuditEventViewSchema = Schema.Struct({
  eventId: Schema.NonEmptyString,
  timestamp: Schema.NonEmptyString,
  actorId: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
  action: AuditActionSchema,
  target: Schema.NonEmptyString,
  reason: Schema.optional(Schema.NonEmptyString),
  correlationId: Schema.optional(Schema.NonEmptyString),
});

export type AdminGovernanceAuditEventView = Schema.Schema.Type<
  typeof AdminGovernanceAuditEventViewSchema
>;

export const AdminGovernanceAuditEventViewListSchema = Schema.Array(
  AdminGovernanceAuditEventViewSchema,
);

export const AdminGovernanceAuditExportViewSchema = Schema.Struct({
  exportedAt: Schema.NonEmptyString,
  recordCount: Schema.Number,
  filter: AdminGovernanceAuditExportFilterSchema,
  events: AdminGovernanceAuditEventViewListSchema,
});

export type AdminGovernanceAuditExportView = Schema.Schema.Type<
  typeof AdminGovernanceAuditExportViewSchema
>;

export const AdminGovernanceAuthorizationAllowSourceSchema = Schema.Literal(
  "matched-tuple",
  "delegated-subject",
  "break-glass",
  "denied",
);

export type AdminGovernanceAuthorizationAllowSource = Schema.Schema.Type<
  typeof AdminGovernanceAuthorizationAllowSourceSchema
>;

export const AdminGovernanceAuthorizationMatchedTupleViewSchema = Schema.Struct(
  {
    namespace: AuthorizationNamespaceSchema,
    object: Schema.NonEmptyString,
    relation: AuthorizationRelationSchema,
    subject: Schema.NonEmptyString,
  },
);

export type AdminGovernanceAuthorizationMatchedTupleView = Schema.Schema.Type<
  typeof AdminGovernanceAuthorizationMatchedTupleViewSchema
>;

export const AdminGovernanceAuthorizationDecisionViewSchema = Schema.Struct({
  allowed: Schema.Boolean,
  reason: Schema.NonEmptyString,
  auditRequired: Schema.Boolean,
  matchedTuple: Schema.optional(
    AdminGovernanceAuthorizationMatchedTupleViewSchema,
  ),
});

export type AdminGovernanceAuthorizationDecisionView = Schema.Schema.Type<
  typeof AdminGovernanceAuthorizationDecisionViewSchema
>;

export const AdminGovernanceAuthorizationExplanationViewSchema = Schema.Struct({
  subjectCandidates: Schema.Array(Schema.NonEmptyString),
  matchedSubject: Schema.optional(Schema.NonEmptyString),
  usedBreakGlass: Schema.Boolean,
  impersonationActive: Schema.Boolean,
  requestScope: PlatformScopeSchema,
  requestScopeId: Schema.NonEmptyString,
});

export type AdminGovernanceAuthorizationExplanationView = Schema.Schema.Type<
  typeof AdminGovernanceAuthorizationExplanationViewSchema
>;

export const AdminGovernanceAuthorizationInspectionViewSchema = Schema.Struct({
  allowSource: AdminGovernanceAuthorizationAllowSourceSchema,
  evaluatedActorType: ActorTypeSchema,
  evaluatedActorId: Schema.optional(Schema.NonEmptyString),
  evaluatedSessionId: Schema.optional(Schema.NonEmptyString),
  evaluatedCorrelationId: Schema.NonEmptyString,
  decision: AdminGovernanceAuthorizationDecisionViewSchema,
  explanation: AdminGovernanceAuthorizationExplanationViewSchema,
});

export type AdminGovernanceAuthorizationInspectionView = Schema.Schema.Type<
  typeof AdminGovernanceAuthorizationInspectionViewSchema
>;

export const AdminGovernanceAuthorizationTupleViewSchema =
  AdminGovernanceAuthorizationMatchedTupleViewSchema;

export type AdminGovernanceAuthorizationTupleView = Schema.Schema.Type<
  typeof AdminGovernanceAuthorizationTupleViewSchema
>;

export const AdminGovernanceWriteAuthorizationTupleRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    tuple: AdminGovernanceAuthorizationTupleViewSchema,
    reason: Schema.NonEmptyString,
  });

export type AdminGovernanceWriteAuthorizationTupleRequest = Schema.Schema.Type<
  typeof AdminGovernanceWriteAuthorizationTupleRequestSchema
>;

const WriteAuthorizationTupleCommandSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  tuple: AdminGovernanceAuthorizationTupleViewSchema,
  reason: Schema.NonEmptyString,
});

type WriteAuthorizationTupleCommand = Schema.Schema.Type<
  typeof WriteAuthorizationTupleCommandSchema
>;

const RuntimeConfigRenameMapSchema = Schema.Record({
  key: DeclaredRuntimeGovernedKeySchema,
  value: DeclaredRuntimeGovernedKeySchema,
});

export const PersistRuntimeConfigProposalsRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
  renameMap: RuntimeConfigRenameMapSchema,
});

const PersistRuntimeConfigProposalsCommandSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  moduleId: PlatformModuleIdSchema,
  renameMap: RuntimeConfigRenameMapSchema,
});

export const SubmitRuntimeConfigOverrideProposalRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
  key: DeclaredRuntimeGovernedKeySchema,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  value: Schema.Unknown,
  approvalReason: Schema.NonEmptyString,
});

export const ReviewRuntimeConfigProposalRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  proposalId: Schema.NonEmptyString,
  status: RuntimeConfigProposalDecisionStatusSchema,
  decisionReason: Schema.NonEmptyString,
});

const SubmitRuntimeConfigOverrideProposalCommandSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  moduleId: PlatformModuleIdSchema,
  key: DeclaredRuntimeGovernedKeySchema,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  value: Schema.Unknown,
  approvalReason: Schema.NonEmptyString,
});

const ReviewRuntimeConfigProposalCommandSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  proposalId: Schema.NonEmptyString,
  status: RuntimeConfigProposalDecisionStatusSchema,
  decisionReason: Schema.NonEmptyString,
});

const QueryAuditEventsByTargetCommandSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  moduleId: PlatformModuleIdSchema,
  target: Schema.NonEmptyString,
});

const QueryAuditEventsByActorCommandSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  actorId: Schema.NonEmptyString,
});

const QueryAuditEventsByTenantCommandSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
});

const ExportAuditEventsCommandSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  filter: AdminGovernanceAuditExportFilterSchema,
});

export type AdminGovernanceListByModuleRequest = Schema.Schema.Type<
  typeof AdminGovernanceListByModuleRequestSchema
>;

export type PersistRuntimeConfigProposalsRequest = Schema.Schema.Type<
  typeof PersistRuntimeConfigProposalsRequestSchema
>;

type PersistRuntimeConfigProposalsCommand = Schema.Schema.Type<
  typeof PersistRuntimeConfigProposalsCommandSchema
>;

type SubmitRuntimeConfigOverrideProposalCommand = Schema.Schema.Type<
  typeof SubmitRuntimeConfigOverrideProposalCommandSchema
>;

type ReviewRuntimeConfigProposalCommand = Schema.Schema.Type<
  typeof ReviewRuntimeConfigProposalCommandSchema
>;

type QueryAuditEventsByTargetCommand = Schema.Schema.Type<
  typeof QueryAuditEventsByTargetCommandSchema
>;

type QueryAuditEventsByActorCommand = Schema.Schema.Type<
  typeof QueryAuditEventsByActorCommandSchema
>;

type QueryAuditEventsByTenantCommand = Schema.Schema.Type<
  typeof QueryAuditEventsByTenantCommandSchema
>;

type ExportAuditEventsCommand = Schema.Schema.Type<
  typeof ExportAuditEventsCommandSchema
>;

export type SubmitRuntimeConfigOverrideProposalRequest = Schema.Schema.Type<
  typeof SubmitRuntimeConfigOverrideProposalRequestSchema
>;

export type ReviewRuntimeConfigProposalRequest = Schema.Schema.Type<
  typeof ReviewRuntimeConfigProposalRequestSchema
>;

export const AdminGovernanceSubmitRuntimeConfigOverrideProposalResponseSchema =
  Schema.Struct({
    proposal: AdminGovernanceRuntimeConfigProposalViewSchema,
    auditEvent: AdminGovernanceAuditEventViewSchema,
  });

export type AdminGovernanceSubmitRuntimeConfigOverrideProposalResponse =
  Schema.Schema.Type<
    typeof AdminGovernanceSubmitRuntimeConfigOverrideProposalResponseSchema
  >;

export const AdminGovernanceReviewRuntimeConfigProposalResponseSchema =
  Schema.Struct({
    proposal: AdminGovernanceRuntimeConfigProposalViewSchema,
    auditEvent: AdminGovernanceAuditEventViewSchema,
  });

export type AdminGovernanceReviewRuntimeConfigProposalResponse =
  Schema.Schema.Type<
    typeof AdminGovernanceReviewRuntimeConfigProposalResponseSchema
  >;

export const AdminGovernanceWriteAuthorizationTupleResponseSchema =
  Schema.Struct({
    tuple: AdminGovernanceAuthorizationTupleViewSchema,
    auditEvent: AdminGovernanceAuditEventViewSchema,
  });

export type AdminGovernanceWriteAuthorizationTupleResponse = Schema.Schema.Type<
  typeof AdminGovernanceWriteAuthorizationTupleResponseSchema
>;

export type AdminGovernanceProjectionConfigurationError = {
  readonly _tag: "AdminGovernanceProjectionConfigurationError";
  readonly moduleId: PlatformModuleId;
  readonly profile: string;
  readonly reason: string;
};

export type AdminGovernanceProjectedRecordParseError = {
  readonly _tag: "AdminGovernanceProjectedRecordParseError";
  readonly recordType:
    | "runtimeConfigOverride"
    | "featureFlag"
    | "runtimeConfigProposal"
    | "auditEvent"
    | "authorizationInspection"
    | "authorizationTupleMutation";
  readonly cause: ParseResult.ParseError;
};

export type AdminGovernanceUnauthenticatedActorError = {
  readonly _tag: "AdminGovernanceUnauthenticatedActorError";
};

export type AdminGovernanceRequestContextNotFoundError = {
  readonly _tag: "AdminGovernanceRequestContextNotFoundError";
  readonly sessionId: AdminGovernanceSessionLookup["sessionId"];
};

export type AdminGovernanceRequestContextMalformedError = {
  readonly _tag: "AdminGovernanceRequestContextMalformedError";
  readonly sessionId: AdminGovernanceSessionLookup["sessionId"];
};

export type AdminGovernanceReadUnauthenticatedActorError = {
  readonly _tag: "AdminGovernanceReadUnauthenticatedActorError";
};

export type AdminGovernanceReadAccessDeniedError = {
  readonly _tag: "AdminGovernanceReadAccessDeniedError";
  readonly actorType: RequestContext["actorType"];
};

export type AdminGovernanceMutationAccessDeniedError = {
  readonly _tag: "AdminGovernanceMutationAccessDeniedError";
  readonly actorType: RequestContext["actorType"];
};

export type AdminGovernanceProposalPersistenceError = {
  readonly _tag: "AdminGovernanceProposalPersistenceError";
  readonly cause: unknown;
};

export type AdminGovernanceRuntimeGovernedOverrideValidationError = {
  readonly _tag: "AdminGovernanceRuntimeGovernedOverrideValidationError";
  readonly moduleId: PlatformModuleId;
  readonly key: SubmitRuntimeConfigOverrideProposalCommand["key"];
  readonly reason: string;
};

export type AdminGovernanceAuditExportFilterError = {
  readonly _tag: "AdminGovernanceAuditExportFilterError";
  readonly reason: string;
};

export type AdminGovernanceProposalReviewConflictError = {
  readonly _tag: "AdminGovernanceProposalReviewConflictError";
  readonly proposalId: ReviewRuntimeConfigProposalCommand["proposalId"];
  readonly status: RuntimeConfigGovernanceProposalRecord["status"];
};

export type AdminGovernanceServiceError =
  | ParseResult.ParseError
  | AuthorizationDelegatedCheckError
  | OryKetoAdapterRequestError
  | RuntimeConfigModulePersistenceError
  | AuditLogPostgresRepositoryError
  | BillingStatePostgresRepositoryError
  | PostgresAdapterConnectionError
  | ValkeyAdapterOperationError
  | AdminGovernanceProjectionConfigurationError
  | AdminGovernanceProjectedRecordParseError
  | AdminGovernanceRequestContextNotFoundError
  | AdminGovernanceRequestContextMalformedError
  | AdminGovernanceReadUnauthenticatedActorError
  | AdminGovernanceReadAccessDeniedError
  | AdminGovernanceMutationAccessDeniedError
  | AdminGovernanceUnauthenticatedActorError
  | AdminGovernanceProposalReviewConflictError
  | AdminGovernanceProposalPersistenceError
  | AdminGovernanceRuntimeGovernedOverrideValidationError
  | AdminGovernanceAuditExportFilterError;

type AuthenticatedAdminGovernanceRequestContext = RequestContext & {
  readonly actorId: string;
};

type AuthenticatedAdminGovernanceMutationRequestContext =
  AuthenticatedAdminGovernanceRequestContext & {
    readonly sessionId: string;
  };

type AdminGovernanceAuthorization = Pick<
  AuthorizationModuleService,
  "check" | "explain"
>;

type AdminGovernanceAuthorizationTupleWriter = (
  input: OryKetoTuple,
) => Effect.Effect<
  OryKetoTuple,
  ParseResult.ParseError | OryKetoAdapterRequestError
>;

type RuntimeConfigGovernanceProposalRecord =
  | RuntimeConfigOverrideProposalRecord
  | RuntimeConfigSyncArtifactRecord;

type AdminGovernanceRuntimeConfigProposalPersistence = {
  readonly persistSubmittedOverrideProposal: (input: {
    readonly requestContext: AuthenticatedAdminGovernanceRequestContext;
    readonly moduleId: SubmitRuntimeConfigOverrideProposalCommand["moduleId"];
    readonly key: SubmitRuntimeConfigOverrideProposalCommand["key"];
    readonly scope: SubmitRuntimeConfigOverrideProposalCommand["scope"];
    readonly scopeId: SubmitRuntimeConfigOverrideProposalCommand["scopeId"];
    readonly value: SubmitRuntimeConfigOverrideProposalCommand["value"];
    readonly approvalReason: SubmitRuntimeConfigOverrideProposalCommand["approvalReason"];
  }) => Effect.Effect<
    {
      readonly proposal: RuntimeConfigOverrideProposalRecord;
      readonly auditEvent: AuditEvent;
    },
    | ParseResult.ParseError
    | RuntimeConfigModulePersistenceError
    | AuditLogPostgresRepositoryError
    | AdminGovernanceProposalPersistenceError
  >;
  readonly persistReviewedProposal: (input: {
    readonly requestContext: AuthenticatedAdminGovernanceRequestContext;
    readonly proposalId: ReviewRuntimeConfigProposalCommand["proposalId"];
    readonly status: ReviewRuntimeConfigProposalCommand["status"];
    readonly decisionReason: ReviewRuntimeConfigProposalCommand["decisionReason"];
  }) => Effect.Effect<
    {
      readonly proposal: RuntimeConfigGovernanceProposalRecord;
      readonly auditEvent: AuditEvent;
    },
    | ParseResult.ParseError
    | RuntimeConfigModulePersistenceError
    | RuntimeConfigOverrideProposalNotFoundError
    | AuditLogPostgresRepositoryError
    | AdminGovernanceProposalReviewConflictError
    | AdminGovernanceRuntimeGovernedOverrideValidationError
    | AdminGovernanceProposalPersistenceError
  >;
};

export type AdminGovernanceService = {
  readonly resolveRequestContext: (
    input: AdminGovernanceSessionLookup,
  ) => Effect.Effect<
    Schema.Schema.Type<typeof RequestContextSchema>,
    | ParseResult.ParseError
    | ValkeyAdapterOperationError
    | AdminGovernanceRequestContextMalformedError
    | AdminGovernanceRequestContextNotFoundError
  >;
  readonly listRuntimeConfigOverrides: (
    input: AdminGovernanceListByModuleRequest,
  ) => Effect.Effect<
    readonly AdminGovernanceRuntimeConfigOverrideView[],
    AdminGovernanceServiceError
  >;
  readonly listFeatureFlags: (
    input: AdminGovernanceListByModuleRequest,
  ) => Effect.Effect<
    readonly AdminGovernanceFeatureFlagView[],
    AdminGovernanceServiceError
  >;
  readonly inspectAuthorization: (
    input: InspectAuthorizationCommand,
  ) => Effect.Effect<
    AdminGovernanceAuthorizationInspectionView,
    AdminGovernanceServiceError
  >;
  readonly writeAuthorizationTuple: (
    input: WriteAuthorizationTupleCommand,
  ) => Effect.Effect<
    AdminGovernanceWriteAuthorizationTupleResponse,
    AdminGovernanceServiceError
  >;
  readonly submitRuntimeConfigOverrideProposal: (
    input: SubmitRuntimeConfigOverrideProposalCommand,
  ) => Effect.Effect<
    AdminGovernanceSubmitRuntimeConfigOverrideProposalResponse,
    AdminGovernanceServiceError
  >;
  readonly reviewRuntimeConfigProposal: (
    input: ReviewRuntimeConfigProposalCommand,
  ) => Effect.Effect<
    AdminGovernanceReviewRuntimeConfigProposalResponse,
    AdminGovernanceServiceError
  >;
  readonly persistRuntimeConfigProposals: (
    input: PersistRuntimeConfigProposalsCommand,
  ) => Effect.Effect<
    readonly AdminGovernanceRuntimeConfigProposalView[],
    AdminGovernanceServiceError
  >;
  readonly listRuntimeConfigProposals: (
    input: AdminGovernanceListByModuleRequest,
  ) => Effect.Effect<
    readonly AdminGovernanceRuntimeConfigProposalView[],
    AdminGovernanceServiceError
  >;
  readonly queryAuditEventsByModule: (
    input: AdminGovernanceListByModuleRequest,
  ) => Effect.Effect<
    readonly AdminGovernanceAuditEventView[],
    AdminGovernanceServiceError
  >;
  readonly queryAuditEventsByTarget: (
    input: QueryAuditEventsByTargetCommand,
  ) => Effect.Effect<
    readonly AdminGovernanceAuditEventView[],
    AdminGovernanceServiceError
  >;
  readonly queryAuditEventsByActor: (
    input: QueryAuditEventsByActorCommand,
  ) => Effect.Effect<
    readonly AdminGovernanceAuditEventView[],
    AdminGovernanceServiceError
  >;
  readonly queryAuditEventsByTenant: (
    input: QueryAuditEventsByTenantCommand,
  ) => Effect.Effect<
    readonly AdminGovernanceAuditEventView[],
    AdminGovernanceServiceError
  >;
  readonly exportAuditEvents: (
    input: ExportAuditEventsCommand,
  ) => Effect.Effect<
    AdminGovernanceAuditExportView,
    AdminGovernanceServiceError
  >;
};

const buildRuntimeConfigOverrideTarget = (
  override: Pick<
    RuntimeConfigOverrideRecord,
    "moduleId" | "key" | "scope" | "scopeId"
  >,
) =>
  `${override.moduleId}:${override.key}:${override.scope}:${override.scopeId}`;

const buildAuthorizationTupleTarget = (
  tuple: Pick<
    AdminGovernanceAuthorizationTupleView,
    "namespace" | "object" | "relation" | "subject"
  >,
) =>
  `${platformModuleId.authorization}:${tuple.namespace}:${tuple.object}:${tuple.relation}:${tuple.subject}`;

const buildRuntimeConfigOverrideProposalId = (
  proposal: Pick<
    SubmitRuntimeConfigOverrideProposalCommand,
    "moduleId" | "key" | "scope" | "scopeId"
  >,
) =>
  `${proposal.moduleId}:${proposal.key}:${proposal.scope}:${proposal.scopeId}:override`;

const buildRuntimeConfigProposalTarget = (
  proposal: Pick<RuntimeConfigGovernanceProposalRecord, "proposalId">,
) => proposal.proposalId;

type RuntimeGovernedDeclaration =
  | {
      readonly recordType: "configKey";
      readonly declaration: ConfigKeyDeclaration;
    }
  | {
      readonly recordType: "featureFlag";
      readonly declaration: FeatureFlagDeclaration;
    };

const findRuntimeGovernedDeclaration = (
  moduleId: PlatformModuleId,
  key: SubmitRuntimeConfigOverrideProposalCommand["key"],
): RuntimeGovernedDeclaration | undefined => {
  const moduleManifest = findModuleManifest(moduleId);
  const configKey = moduleManifest?.configKeys.find(
    (declaration) => declaration.key === key,
  );

  if (configKey !== undefined) {
    return {
      recordType: "configKey",
      declaration: configKey,
    };
  }

  const featureFlag = moduleManifest?.featureFlags.find(
    (declaration) => declaration.key === key,
  );

  if (featureFlag !== undefined) {
    return {
      recordType: "featureFlag",
      declaration: featureFlag,
    };
  }

  return undefined;
};

const isValidConfigOverrideValue = (
  declaration: ConfigKeyDeclaration,
  value: unknown,
) => {
  if (value === configDefaultValue.inherit) {
    return true;
  }

  switch (declaration.schema) {
    case configSchemaType.boolean:
      return typeof value === "boolean";
    case configSchemaType.string:
      return typeof value === "string";
    case configSchemaType.number:
      return typeof value === "number" && Number.isFinite(value);
    case configSchemaType.stringOrNull:
      return value === null || typeof value === "string";
  }
};

const buildRuntimeGovernedOverrideValidationError = (input: {
  readonly moduleId: PlatformModuleId;
  readonly key: SubmitRuntimeConfigOverrideProposalCommand["key"];
  readonly reason: string;
}): AdminGovernanceRuntimeGovernedOverrideValidationError => ({
  _tag: "AdminGovernanceRuntimeGovernedOverrideValidationError",
  moduleId: input.moduleId,
  key: input.key,
  reason: input.reason,
});

const validateRuntimeGovernedOverrideProposal = (
  proposal: Pick<
    | SubmitRuntimeConfigOverrideProposalCommand
    | RuntimeConfigOverrideProposalRecord,
    "moduleId" | "key" | "scope" | "value"
  >,
): Effect.Effect<
  void,
  AdminGovernanceRuntimeGovernedOverrideValidationError
> => {
  const declaration = findRuntimeGovernedDeclaration(
    proposal.moduleId,
    proposal.key,
  );

  if (declaration === undefined) {
    return Effect.fail(
      buildRuntimeGovernedOverrideValidationError({
        moduleId: proposal.moduleId,
        key: proposal.key,
        reason: `Runtime-governed key ${proposal.key} is not declared for module ${proposal.moduleId}.`,
      }),
    );
  }

  if (!declaration.declaration.allowedScopes.includes(proposal.scope)) {
    return Effect.fail(
      buildRuntimeGovernedOverrideValidationError({
        moduleId: proposal.moduleId,
        key: proposal.key,
        reason: `Runtime-governed key ${proposal.key} cannot be overridden at ${proposal.scope} scope.`,
      }),
    );
  }

  if (declaration.recordType === "featureFlag") {
    if (declaration.declaration.lifecycle === featureFlagLifecycle.retired) {
      return Effect.fail(
        buildRuntimeGovernedOverrideValidationError({
          moduleId: proposal.moduleId,
          key: proposal.key,
          reason: `Feature-flag override proposals cannot target retired flag ${proposal.key}.`,
        }),
      );
    }

    return typeof proposal.value === "boolean"
      ? Effect.void
      : Effect.fail(
          buildRuntimeGovernedOverrideValidationError({
            moduleId: proposal.moduleId,
            key: proposal.key,
            reason: `Feature-flag override value for ${proposal.key} must be a boolean.`,
          }),
        );
  }

  return isValidConfigOverrideValue(declaration.declaration, proposal.value)
    ? Effect.void
    : Effect.fail(
        buildRuntimeGovernedOverrideValidationError({
          moduleId: proposal.moduleId,
          key: proposal.key,
          reason: `Runtime-config override value for ${proposal.key} must match the declared ${declaration.declaration.schema} schema or use ${configDefaultValue.inherit}.`,
        }),
      );
};

const validateApprovedRuntimeGovernedOverrideReview = (
  runtimeConfig: RuntimeConfigModuleService,
  request: Pick<ReviewRuntimeConfigProposalCommand, "proposalId" | "status">,
): Effect.Effect<
  void,
  | RuntimeConfigModulePersistenceError
  | RuntimeConfigOverrideProposalNotFoundError
  | AdminGovernanceRuntimeGovernedOverrideValidationError
> => {
  if (
    request.status !== runtimeConfigSyncArtifactStatus.approved ||
    !request.proposalId.endsWith(":override")
  ) {
    return Effect.void;
  }

  const separatorIndex = request.proposalId.indexOf(":");
  const proposalModuleId =
    separatorIndex === -1
      ? undefined
      : request.proposalId.slice(0, separatorIndex);

  if (proposalModuleId === undefined) {
    return Effect.fail({
      _tag: "RuntimeConfigOverrideProposalNotFoundError",
      proposalId: request.proposalId,
    } satisfies RuntimeConfigOverrideProposalNotFoundError);
  }

  return Schema.decodeUnknown(PlatformModuleIdSchema)(proposalModuleId).pipe(
    Effect.mapError(
      (): RuntimeConfigOverrideProposalNotFoundError => ({
        _tag: "RuntimeConfigOverrideProposalNotFoundError",
        proposalId: request.proposalId,
      }),
    ),
    Effect.flatMap((moduleId) =>
      runtimeConfig.listOverrideProposalsByModule(moduleId),
    ),
    Effect.flatMap(
      (
        proposals: readonly RuntimeConfigOverrideProposalRecord[],
      ): Effect.Effect<
        void,
        | RuntimeConfigOverrideProposalNotFoundError
        | AdminGovernanceRuntimeGovernedOverrideValidationError
      > => {
        const proposal = proposals.find(
          (candidate) => candidate.proposalId === request.proposalId,
        );

        return proposal === undefined
          ? Effect.fail({
              _tag: "RuntimeConfigOverrideProposalNotFoundError",
              proposalId: request.proposalId,
            } satisfies RuntimeConfigOverrideProposalNotFoundError)
          : validateRuntimeGovernedOverrideProposal(proposal);
      },
    ),
  );
};

const requireAuthenticatedActorId = (requestContext: RequestContext) =>
  Effect.fromNullable(requestContext.actorId).pipe(
    Effect.map((actorId) => ({
      ...requestContext,
      actorId,
    })),
    Effect.mapError(
      (): AdminGovernanceUnauthenticatedActorError => ({
        _tag: "AdminGovernanceUnauthenticatedActorError",
      }),
    ),
  );

const requireAuthenticatedMutationContext = (requestContext: RequestContext) =>
  requireAuthenticatedActorId(requestContext).pipe(
    Effect.flatMap((authenticatedRequestContext) =>
      Effect.fromNullable(authenticatedRequestContext.sessionId).pipe(
        Effect.map((sessionId) => ({
          ...authenticatedRequestContext,
          sessionId,
        })),
        Effect.mapError(
          (): AdminGovernanceUnauthenticatedActorError => ({
            _tag: "AdminGovernanceUnauthenticatedActorError",
          }),
        ),
      ),
    ),
  );

const buildStoredRuntimeConfigOverride = (input: {
  readonly proposal: Pick<
    RuntimeConfigOverrideProposalRecord,
    "moduleId" | "key" | "scope" | "scopeId" | "value" | "approvalReason"
  >;
  readonly actorId: string;
  readonly changedAt: string;
}) =>
  Schema.decodeUnknown(RuntimeConfigOverrideRecordSchema)({
    moduleId: input.proposal.moduleId,
    key: input.proposal.key,
    scope: input.proposal.scope,
    scopeId: input.proposal.scopeId,
    value: input.proposal.value,
    source: runtimeResolutionSource.runtimeOverride,
    changedBy: input.actorId,
    changedAt: input.changedAt,
    approvalReason: input.proposal.approvalReason,
  });

const buildSubmittedRuntimeConfigOverrideProposal = (
  request: SubmitRuntimeConfigOverrideProposalCommand,
  actorId: string,
) =>
  Schema.decodeUnknown(RuntimeConfigOverrideProposalSubmitRecordSchema)({
    proposalId: buildRuntimeConfigOverrideProposalId(request),
    moduleId: request.moduleId,
    key: request.key,
    scope: request.scope,
    scopeId: request.scopeId,
    value: request.value,
    source: runtimeResolutionSource.runtimeOverride,
    changedBy: actorId,
    changedAt: new Date().toISOString(),
    approvalReason: request.approvalReason,
  });

const toIsoString = (value: Date | string | null | undefined) =>
  value == null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;

const buildStoredRuntimeConfigSyncProposal = (
  row: typeof runtimeConfigSyncArtifactsTable.$inferSelect,
) =>
  Schema.decodeUnknown(RuntimeConfigSyncArtifactRecordSchema)({
    proposalId: row.proposalId,
    moduleId: row.moduleId,
    key: row.key,
    action: row.action,
    artifactPath: row.artifactPath,
    ...(row.runtimeValue != null ? { runtimeValue: row.runtimeValue } : {}),
    ...(row.codeValue != null ? { codeValue: row.codeValue } : {}),
    status: row.status,
    generatedAt: toIsoString(row.generatedAt) ?? new Date().toISOString(),
    ...(row.decidedBy != null ? { decidedBy: row.decidedBy } : {}),
    ...(row.decisionReason != null
      ? { decisionReason: row.decisionReason }
      : {}),
    ...(toIsoString(row.decidedAt) !== undefined
      ? { decidedAt: toIsoString(row.decidedAt) }
      : {}),
  });

const buildStoredRuntimeConfigOverrideProposal = (
  row: typeof runtimeConfigOverrideProposalsTable.$inferSelect,
) =>
  Schema.decodeUnknown(RuntimeConfigOverrideProposalRecordSchema)({
    proposalId: row.proposalId,
    moduleId: row.moduleId,
    key: row.key,
    scope: row.scope,
    scopeId: row.scopeId,
    value: row.value,
    source: row.source,
    changedBy: row.changedBy,
    changedAt: toIsoString(row.changedAt) ?? new Date().toISOString(),
    approvalReason: row.approvalReason,
    status: row.status,
    ...(row.decidedBy != null ? { decidedBy: row.decidedBy } : {}),
    ...(row.decisionReason != null
      ? { decisionReason: row.decisionReason }
      : {}),
    ...(toIsoString(row.decidedAt) !== undefined
      ? { decidedAt: toIsoString(row.decidedAt) }
      : {}),
  });

const buildReviewedRuntimeConfigProposal = (
  request: ReviewRuntimeConfigProposalCommand,
  actorId: string,
) =>
  Schema.decodeUnknown(RuntimeConfigSyncArtifactReviewRecordSchema)({
    proposalId: request.proposalId,
    status: request.status,
    decidedBy: actorId,
    decisionReason: request.decisionReason,
    decidedAt: new Date().toISOString(),
  });

const resolveAdminGovernanceRequestContext = (
  valkey: ValkeyAdapter["Type"],
  input: AdminGovernanceSessionLookup,
) =>
  Schema.decodeUnknown(AdminGovernanceSessionLookupSchema)(input).pipe(
    Effect.flatMap((request) =>
      resolveIdentitySessionRequestContext(valkey, request).pipe(
        Effect.mapError((error) =>
          error._tag === "ParseError"
            ? ({
                _tag: "AdminGovernanceRequestContextMalformedError",
                sessionId: request.sessionId,
              } satisfies AdminGovernanceRequestContextMalformedError)
            : error._tag === "IdentitySessionRequestContextNotFoundError"
              ? ({
                  _tag: "AdminGovernanceRequestContextNotFoundError",
                  sessionId: request.sessionId,
                } satisfies AdminGovernanceRequestContextNotFoundError)
              : error,
        ),
      ),
    ),
  );

const ensureAdminGovernanceReadAccess = (
  requestContext: RequestContext,
): Effect.Effect<
  AuthenticatedAdminGovernanceRequestContext,
  | AdminGovernanceReadUnauthenticatedActorError
  | AdminGovernanceReadAccessDeniedError
> => {
  return Effect.fromNullable(requestContext.actorId).pipe(
    Effect.map((actorId) => ({
      ...requestContext,
      actorId,
    })),
    Effect.mapError(
      (): AdminGovernanceReadUnauthenticatedActorError => ({
        _tag: "AdminGovernanceReadUnauthenticatedActorError",
      }),
    ),
    Effect.flatMap((authenticatedRequestContext) =>
      authenticatedRequestContext.actorType === actorType.platformOperator ||
      authenticatedRequestContext.actorType === actorType.supportOperator
        ? Effect.succeed(authenticatedRequestContext)
        : Effect.fail({
            _tag: "AdminGovernanceReadAccessDeniedError",
            actorType: authenticatedRequestContext.actorType,
          } satisfies AdminGovernanceReadAccessDeniedError),
    ),
  );
};

const ensureAdminGovernanceMutationAccess = (
  requestContext: RequestContext,
): Effect.Effect<
  AuthenticatedAdminGovernanceMutationRequestContext,
  | AdminGovernanceUnauthenticatedActorError
  | AdminGovernanceMutationAccessDeniedError
> =>
  requireAuthenticatedMutationContext(requestContext).pipe(
    Effect.flatMap((authenticatedRequestContext) =>
      authenticatedRequestContext.actorType === actorType.platformOperator ||
      authenticatedRequestContext.actorType === actorType.supportOperator
        ? Effect.succeed(authenticatedRequestContext)
        : Effect.fail({
            _tag: "AdminGovernanceMutationAccessDeniedError",
            actorType: authenticatedRequestContext.actorType,
          } satisfies AdminGovernanceMutationAccessDeniedError),
    ),
  );

type AdminGovernanceFieldSecurity = FieldSecurityModuleService;

const hasProjectedFieldValue = (
  record: Record<string, unknown>,
  fieldPath: string,
) =>
  fieldPath
    .split(".")
    .reduce<unknown>(
      (value, segment) =>
        value !== null && typeof value === "object" && segment in value
          ? (value as Record<string, unknown>)[segment]
          : undefined,
      record,
    ) !== undefined;

const decodeAdminGovernanceRuntimeConfigOverrideView = Schema.decodeUnknown(
  AdminGovernanceRuntimeConfigOverrideViewSchema,
);

const decodeAdminGovernanceFeatureFlagView = Schema.decodeUnknown(
  AdminGovernanceFeatureFlagViewSchema,
);

const decodeAdminGovernanceRuntimeConfigProposalView = Schema.decodeUnknown(
  AdminGovernanceRuntimeConfigProposalViewSchema,
);

const decodeAdminGovernanceAuditEventView = Schema.decodeUnknown(
  AdminGovernanceAuditEventViewSchema,
);

const decodeAdminGovernanceAuthorizationInspectionView = Schema.decodeUnknown(
  AdminGovernanceAuthorizationInspectionViewSchema,
);

const decodeAdminGovernanceAuthorizationTupleView = Schema.decodeUnknown(
  AdminGovernanceAuthorizationTupleViewSchema,
);

const decodeAdminGovernanceAuthorizationTupleMutationRecord =
  Schema.decodeUnknown(
    Schema.Struct({
      tuple: AdminGovernanceAuthorizationTupleViewSchema,
    }),
  );

const resolveAuthorizationAllowSource = (input: {
  readonly decision: AdminGovernanceAuthorizationDecisionView;
  readonly explanation: AdminGovernanceAuthorizationExplanationView;
}): AdminGovernanceAuthorizationAllowSource => {
  if (input.decision.allowed === false) {
    return "denied";
  }

  if (input.decision.matchedTuple !== undefined) {
    return "matched-tuple";
  }

  if (input.explanation.usedBreakGlass) {
    return "break-glass";
  }

  return "delegated-subject";
};

const buildAdminGovernanceAuthorizationInspectionView = (input: {
  readonly checkInput: AuthorizationCheckInput;
  readonly decision: AuthorizationDecision;
  readonly explanation: AuthorizationExplanation;
}) => {
  const decisionView: AdminGovernanceAuthorizationDecisionView = {
    allowed: input.decision.allowed,
    reason: input.decision.reason,
    auditRequired: input.decision.auditRequired,
    ...(input.decision.matchedTuple !== undefined
      ? {
          matchedTuple: {
            namespace: input.decision.matchedTuple.namespace,
            object: input.decision.matchedTuple.object,
            relation: input.decision.matchedTuple.relation,
            subject: input.decision.matchedTuple.subject,
          },
        }
      : {}),
  };
  const explanationView: AdminGovernanceAuthorizationExplanationView = {
    subjectCandidates: [...input.explanation.subjectCandidates],
    ...(input.explanation.matchedSubject !== undefined
      ? { matchedSubject: input.explanation.matchedSubject }
      : {}),
    usedBreakGlass: input.explanation.usedBreakGlass,
    impersonationActive:
      input.checkInput.requestContext.impersonation !== undefined,
    requestScope: input.explanation.requestScope,
    requestScopeId: input.explanation.requestScopeId,
  };

  return Schema.decodeUnknown(AdminGovernanceAuthorizationInspectionViewSchema)(
    {
      allowSource: resolveAuthorizationAllowSource({
        decision: decisionView,
        explanation: explanationView,
      }),
      evaluatedActorType: input.checkInput.requestContext.actorType,
      ...(input.checkInput.requestContext.actorId !== undefined
        ? { evaluatedActorId: input.checkInput.requestContext.actorId }
        : {}),
      ...(input.checkInput.requestContext.sessionId !== undefined
        ? { evaluatedSessionId: input.checkInput.requestContext.sessionId }
        : {}),
      evaluatedCorrelationId: input.checkInput.requestContext.correlationId,
      decision: decisionView,
      explanation: explanationView,
    },
  );
};

const resolveAdminGovernanceProjection = (
  moduleId: PlatformModuleId,
): Effect.Effect<
  ProjectionDescriptor,
  AdminGovernanceProjectionConfigurationError
> =>
  Effect.fromNullable(
    findModuleManifest(moduleId)?.projectionProfiles.find(
      (projection) => projection.profile === projectionProfile.admin,
    ),
  ).pipe(
    Effect.orElseFail(
      (): AdminGovernanceProjectionConfigurationError => ({
        _tag: "AdminGovernanceProjectionConfigurationError",
        moduleId,
        profile: projectionProfile.admin,
        reason:
          "The admin projection must be declared before governance reads can be projected.",
      }),
    ),
  );

const mapProjectedRecordParseError =
  (recordType: AdminGovernanceProjectedRecordParseError["recordType"]) =>
  (
    cause: ParseResult.ParseError,
  ): AdminGovernanceProjectedRecordParseError => ({
    _tag: "AdminGovernanceProjectedRecordParseError",
    recordType,
    cause,
  });

const collectAuditedFields = <A>(
  records: readonly { auditedFields: readonly string[]; record: A }[],
) => [...new Set(records.flatMap((record) => record.auditedFields))];

const appendSensitiveReadAudit = (
  auditLog: AuditLogModuleService,
  input: {
    readonly requestContext: AdminGovernanceListByModuleRequest["requestContext"];
    readonly target: string;
    readonly reason: string;
    readonly auditedFields: readonly string[];
  },
) =>
  input.auditedFields.length === 0
    ? Effect.succeed(undefined)
    : auditLog
        .append({
          requestContext: input.requestContext,
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: input.target,
          reason: input.reason,
        })
        .pipe(Effect.map(() => undefined));

type ProjectedAdminGovernanceRecord<A> = {
  readonly record: A;
  readonly auditedFields: readonly string[];
};

const applyProjectedAdminGovernanceRecord = <A>(input: {
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly moduleId: PlatformModuleId;
  readonly requestContext: AdminGovernanceListByModuleRequest["requestContext"];
  readonly projection: ProjectionDescriptor;
  readonly record: unknown;
  readonly recordType: AdminGovernanceProjectedRecordParseError["recordType"];
  readonly decode: (value: unknown) => Effect.Effect<A, ParseResult.ParseError>;
}): Effect.Effect<
  ProjectedAdminGovernanceRecord<A>,
  ParseResult.ParseError | AdminGovernanceProjectedRecordParseError
> =>
  input.fieldSecurity
    .applyProjection({
      moduleId: input.moduleId,
      requestContext: input.requestContext,
      projection: input.projection,
      record: input.record,
    })
    .pipe(
      Effect.flatMap((result) => {
        const projectedRecord =
          typeof result.projectedRecord === "object" &&
          result.projectedRecord !== null &&
          !Array.isArray(result.projectedRecord)
            ? (result.projectedRecord as Record<string, unknown>)
            : {};

        return input.decode(result.projectedRecord).pipe(
          Effect.mapError(mapProjectedRecordParseError(input.recordType)),
          Effect.map((record) => ({
            record,
            auditedFields: result.auditedFields.filter(
              (field) =>
                hasProjectedFieldValue(projectedRecord, field) &&
                !result.redactedFields.includes(field),
            ),
          })),
        );
      }),
    );

const projectAdminGovernanceRecords = <A>(input: {
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly moduleId: PlatformModuleId;
  readonly requestContext: AdminGovernanceListByModuleRequest["requestContext"];
  readonly projection: ProjectionDescriptor;
  readonly records: readonly unknown[];
  readonly recordType: AdminGovernanceProjectedRecordParseError["recordType"];
  readonly decode: (value: unknown) => Effect.Effect<A, ParseResult.ParseError>;
}): Effect.Effect<
  readonly ProjectedAdminGovernanceRecord<A>[],
  ParseResult.ParseError | AdminGovernanceProjectedRecordParseError
> =>
  Effect.forEach(input.records, (record) =>
    applyProjectedAdminGovernanceRecord({
      fieldSecurity: input.fieldSecurity,
      moduleId: input.moduleId,
      requestContext: input.requestContext,
      projection: input.projection,
      record,
      recordType: input.recordType,
      decode: input.decode,
    }),
  );

const listProjectedRuntimeConfigOverrides = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly auditLog: AuditLogModuleService;
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly projection: ProjectionDescriptor;
  readonly request: AdminGovernanceListByModuleRequest;
}): Effect.Effect<
  readonly AdminGovernanceRuntimeConfigOverrideView[],
  AdminGovernanceServiceError
> =>
  input.runtimeConfig.listOverridesByModule(input.request.moduleId).pipe(
    Effect.flatMap((records) =>
      projectAdminGovernanceRecords({
        fieldSecurity: input.fieldSecurity,
        moduleId: platformModuleId.runtimeConfig,
        requestContext: input.request.requestContext,
        projection: input.projection,
        records,
        recordType: "runtimeConfigOverride",
        decode: decodeAdminGovernanceRuntimeConfigOverrideView,
      }),
    ),
    Effect.flatMap((projectedRecords) => {
      const auditedFields = collectAuditedFields(projectedRecords);

      return appendSensitiveReadAudit(input.auditLog, {
        requestContext: input.request.requestContext,
        target: `${platformModuleId.runtimeConfig}:${input.request.moduleId}:overrides:${auditedFields.join(",")}`,
        reason: `Inspect projected runtime-config overrides for ${input.request.moduleId}.`,
        auditedFields,
      }).pipe(
        Effect.map(() => projectedRecords.map((record) => record.record)),
      );
    }),
  );

const buildAdminGovernanceFeatureFlagView = (input: {
  readonly flag: FeatureFlagDeclaration;
  readonly effectiveState: boolean;
  readonly source: Schema.Schema.Type<typeof RuntimeResolutionSourceSchema>;
  readonly entitled: boolean;
  readonly resolvedScope?: RequestContext["tenant"]["scope"];
}) =>
  decodeAdminGovernanceFeatureFlagView({
    key: input.flag.key,
    description: input.flag.description,
    owner: input.flag.owner,
    purpose: input.flag.purpose,
    defaultEnabled: input.flag.defaultEnabled,
    effectiveState: input.effectiveState,
    source: input.source,
    entitled: input.entitled,
    dependencies: input.flag.dependencies,
    lifecycle: input.flag.lifecycle,
    retirementPlan: input.flag.retirementPlan,
    ...(input.resolvedScope != null ? { scope: input.resolvedScope } : {}),
  });

const listProjectedFeatureFlags = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly billingState: BillingStatePostgresRepository["Type"];
  readonly auditLog: AuditLogModuleService;
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly projection: ProjectionDescriptor;
  readonly request: AdminGovernanceListByModuleRequest;
}): Effect.Effect<
  readonly AdminGovernanceFeatureFlagView[],
  AdminGovernanceServiceError
> => {
  const featureFlags =
    findModuleManifest(input.request.moduleId)?.featureFlags ?? [];

  return input.billingState
    .getTenantAccessState({
      ...input.request.requestContext.tenant,
    })
    .pipe(
      Effect.flatMap((tenantAccessState) =>
        Effect.forEach(featureFlags, (flag) =>
          input.runtimeConfig
            .resolveStoredFeatureFlag({
              requestContext: input.request.requestContext,
              moduleId: input.request.moduleId,
              flag,
              entitlements: tenantAccessState.entitlements,
            })
            .pipe(
              Effect.flatMap((resolution) =>
                buildAdminGovernanceFeatureFlagView({
                  flag,
                  effectiveState: Boolean(resolution.effectiveValue),
                  source: resolution.source,
                  entitled: resolution.entitled,
                  ...(resolution.resolvedScope != null
                    ? { resolvedScope: resolution.resolvedScope }
                    : {}),
                }).pipe(
                  Effect.mapError(
                    (cause) =>
                      ({
                        _tag: "AdminGovernanceProjectedRecordParseError",
                        recordType: "featureFlag",
                        cause,
                      }) satisfies AdminGovernanceProjectedRecordParseError,
                  ),
                ),
              ),
            ),
        ),
      ),
      Effect.flatMap((records) =>
        projectAdminGovernanceRecords({
          fieldSecurity: input.fieldSecurity,
          moduleId: platformModuleId.featureFlags,
          requestContext: input.request.requestContext,
          projection: input.projection,
          records,
          recordType: "featureFlag",
          decode: decodeAdminGovernanceFeatureFlagView,
        }),
      ),
      Effect.flatMap((projectedRecords) => {
        const auditedFields = collectAuditedFields(projectedRecords);

        return appendSensitiveReadAudit(input.auditLog, {
          requestContext: input.request.requestContext,
          target: `${platformModuleId.featureFlags}:${input.request.moduleId}:flags:${auditedFields.join(",")}`,
          reason: `Inspect projected feature flags for ${input.request.moduleId}.`,
          auditedFields,
        }).pipe(
          Effect.map(() => projectedRecords.map((record) => record.record)),
        );
      }),
    );
};

const inspectProjectedAuthorization = (input: {
  readonly authorization: AdminGovernanceAuthorization;
  readonly auditLog: AuditLogModuleService;
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly projection: ProjectionDescriptor;
  readonly request: InspectAuthorizationCommand;
}): Effect.Effect<
  AdminGovernanceAuthorizationInspectionView,
  AdminGovernanceServiceError
> =>
  Effect.all({
    decision: input.authorization.check(input.request.checkInput),
    explanation: input.authorization.explain(input.request.checkInput),
  }).pipe(
    Effect.flatMap(({ decision, explanation }) =>
      buildAdminGovernanceAuthorizationInspectionView({
        checkInput: input.request.checkInput,
        decision,
        explanation,
      }),
    ),
    Effect.flatMap((record) =>
      applyProjectedAdminGovernanceRecord({
        fieldSecurity: input.fieldSecurity,
        moduleId: platformModuleId.authorization,
        requestContext: input.request.requestContext,
        projection: input.projection,
        record,
        recordType: "authorizationInspection",
        decode: decodeAdminGovernanceAuthorizationInspectionView,
      }),
    ),
    Effect.flatMap((projectedRecord) =>
      appendSensitiveReadAudit(input.auditLog, {
        requestContext: input.request.requestContext,
        target: `${platformModuleId.authorization}:${input.request.checkInput.namespace}:${input.request.checkInput.object}:${input.request.checkInput.relation}:inspection:${projectedRecord.auditedFields.join(",")}`,
        reason: `Inspect projected authorization decision for ${input.request.checkInput.namespace}:${input.request.checkInput.object}:${input.request.checkInput.relation}.`,
        auditedFields: projectedRecord.auditedFields,
      }).pipe(Effect.map(() => projectedRecord.record)),
    ),
  );

const projectAuthorizationTupleMutationResponse = (input: {
  readonly auditLog: AuditLogModuleService;
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly requestContext: AuthenticatedAdminGovernanceRequestContext;
  readonly authorizationProjection: ProjectionDescriptor;
  readonly auditLogProjection: ProjectionDescriptor;
  readonly tuple: AdminGovernanceAuthorizationTupleView;
  readonly auditEvent: AuditEvent;
}): Effect.Effect<
  AdminGovernanceWriteAuthorizationTupleResponse,
  AdminGovernanceServiceError
> =>
  Effect.all({
    projectedTuple: applyProjectedAdminGovernanceRecord({
      fieldSecurity: input.fieldSecurity,
      moduleId: platformModuleId.authorization,
      requestContext: input.requestContext,
      projection: input.authorizationProjection,
      record: { tuple: input.tuple },
      recordType: "authorizationTupleMutation",
      decode: decodeAdminGovernanceAuthorizationTupleMutationRecord,
    }),
    projectedAuditEvent: applyProjectedAdminGovernanceRecord({
      fieldSecurity: input.fieldSecurity,
      moduleId: platformModuleId.auditLog,
      requestContext: input.requestContext,
      projection: input.auditLogProjection,
      record: input.auditEvent,
      recordType: "auditEvent",
      decode: decodeAdminGovernanceAuditEventView,
    }),
  }).pipe(
    Effect.flatMap(({ projectedTuple, projectedAuditEvent }) =>
      Effect.all([
        appendSensitiveReadAudit(input.auditLog, {
          requestContext: input.requestContext,
          target: `${buildAuthorizationTupleTarget(input.tuple)}:tuple-mutation:${projectedTuple.auditedFields.join(",")}`,
          reason: `Inspect projected authorization tuple mutation response for ${input.tuple.namespace}:${input.tuple.object}:${input.tuple.relation}.`,
          auditedFields: projectedTuple.auditedFields,
        }),
        appendSensitiveReadAudit(input.auditLog, {
          requestContext: input.requestContext,
          target: `${platformModuleId.auditLog}:${buildAuthorizationTupleTarget(input.tuple)}:tuple-mutation:${projectedAuditEvent.auditedFields.join(",")}`,
          reason: `Inspect projected audit-log authorization tuple mutation response for ${input.tuple.namespace}:${input.tuple.object}:${input.tuple.relation}.`,
          auditedFields: projectedAuditEvent.auditedFields,
        }),
      ]).pipe(
        Effect.map(() => ({
          tuple: projectedTuple.record.tuple,
          auditEvent: projectedAuditEvent.record,
        })),
      ),
    ),
  );

const listProjectedRuntimeConfigProposals = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly auditLog: AuditLogModuleService;
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly projection: ProjectionDescriptor;
  readonly request: AdminGovernanceListByModuleRequest;
}): Effect.Effect<
  readonly AdminGovernanceRuntimeConfigProposalView[],
  AdminGovernanceServiceError
> =>
  Effect.all({
    syncArtifactProposals: input.runtimeConfig.listChangeProposalsByModule(
      input.request.moduleId,
    ),
    overrideProposals: input.runtimeConfig.listOverrideProposalsByModule(
      input.request.moduleId,
    ),
  }).pipe(
    Effect.map(({ overrideProposals, syncArtifactProposals }) =>
      [...overrideProposals, ...syncArtifactProposals].sort((left, right) => {
        const leftTimestamp =
          "changedAt" in left ? left.changedAt : left.generatedAt;
        const rightTimestamp =
          "changedAt" in right ? right.changedAt : right.generatedAt;

        return rightTimestamp.localeCompare(leftTimestamp);
      }),
    ),
    Effect.flatMap((records) =>
      projectAdminGovernanceRecords({
        fieldSecurity: input.fieldSecurity,
        moduleId: platformModuleId.runtimeConfig,
        requestContext: input.request.requestContext,
        projection: input.projection,
        records,
        recordType: "runtimeConfigProposal",
        decode: decodeAdminGovernanceRuntimeConfigProposalView,
      }),
    ),
    Effect.flatMap((projectedRecords) => {
      const auditedFields = collectAuditedFields(projectedRecords);

      return appendSensitiveReadAudit(input.auditLog, {
        requestContext: input.request.requestContext,
        target: `${platformModuleId.runtimeConfig}:${input.request.moduleId}:proposals:${auditedFields.join(",")}`,
        reason: `Inspect projected runtime-config proposals for ${input.request.moduleId}.`,
        auditedFields,
      }).pipe(
        Effect.map(() => projectedRecords.map((record) => record.record)),
      );
    }),
  );

const listProjectedAuditEvents = (input: {
  readonly auditLog: AuditLogModuleService;
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly projection: ProjectionDescriptor;
  readonly request: AdminGovernanceListByModuleRequest;
}): Effect.Effect<
  readonly AdminGovernanceAuditEventView[],
  AdminGovernanceServiceError
> =>
  input.auditLog.queryByModule(input.request.moduleId).pipe(
    Effect.flatMap((records) =>
      projectAdminGovernanceRecords({
        fieldSecurity: input.fieldSecurity,
        moduleId: platformModuleId.auditLog,
        requestContext: input.request.requestContext,
        projection: input.projection,
        records,
        recordType: "auditEvent",
        decode: decodeAdminGovernanceAuditEventView,
      }),
    ),
    Effect.flatMap((projectedRecords) => {
      const auditedFields = collectAuditedFields(projectedRecords);

      return appendSensitiveReadAudit(input.auditLog, {
        requestContext: input.request.requestContext,
        target: `${platformModuleId.auditLog}:${input.request.moduleId}:events:${auditedFields.join(",")}`,
        reason: `Inspect projected audit-log events for ${input.request.moduleId}.`,
        auditedFields,
      }).pipe(
        Effect.map(() => projectedRecords.map((record) => record.record)),
      );
    }),
  );

const listProjectedAuditEventsByTarget = (input: {
  readonly auditLog: AuditLogModuleService;
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly projection: ProjectionDescriptor;
  readonly request: QueryAuditEventsByTargetCommand;
}): Effect.Effect<
  readonly AdminGovernanceAuditEventView[],
  AdminGovernanceServiceError
> =>
  input.auditLog
    .queryByTarget({
      moduleId: input.request.moduleId,
      target: input.request.target,
    })
    .pipe(
      Effect.flatMap((records) =>
        projectAdminGovernanceRecords({
          fieldSecurity: input.fieldSecurity,
          moduleId: platformModuleId.auditLog,
          requestContext: input.request.requestContext,
          projection: input.projection,
          records,
          recordType: "auditEvent",
          decode: decodeAdminGovernanceAuditEventView,
        }),
      ),
      Effect.flatMap((projectedRecords) => {
        const auditedFields = collectAuditedFields(projectedRecords);

        return appendSensitiveReadAudit(input.auditLog, {
          requestContext: input.request.requestContext,
          target: `${platformModuleId.auditLog}:${input.request.moduleId}:target:${input.request.target}:events:${auditedFields.join(",")}`,
          reason: `Inspect projected audit-log events for ${input.request.moduleId} target ${input.request.target}.`,
          auditedFields,
        }).pipe(
          Effect.map(() => projectedRecords.map((record) => record.record)),
        );
      }),
    );

const listProjectedAuditEventsByActor = (input: {
  readonly auditLog: AuditLogModuleService;
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly projection: ProjectionDescriptor;
  readonly request: QueryAuditEventsByActorCommand;
}): Effect.Effect<
  readonly AdminGovernanceAuditEventView[],
  AdminGovernanceServiceError
> =>
  input.auditLog
    .queryByActor({
      actorId: input.request.actorId,
    })
    .pipe(
      Effect.flatMap((records) =>
        projectAdminGovernanceRecords({
          fieldSecurity: input.fieldSecurity,
          moduleId: platformModuleId.auditLog,
          requestContext: input.request.requestContext,
          projection: input.projection,
          records,
          recordType: "auditEvent",
          decode: decodeAdminGovernanceAuditEventView,
        }),
      ),
      Effect.flatMap((projectedRecords) => {
        const auditedFields = collectAuditedFields(projectedRecords);

        return appendSensitiveReadAudit(input.auditLog, {
          requestContext: input.request.requestContext,
          target: `${platformModuleId.auditLog}:actor:${input.request.actorId}:events:${auditedFields.join(",")}`,
          reason: `Inspect projected audit-log events for actor ${input.request.actorId}.`,
          auditedFields,
        }).pipe(
          Effect.map(() => projectedRecords.map((record) => record.record)),
        );
      }),
    );

const listProjectedAuditEventsByTenant = (input: {
  readonly auditLog: AuditLogModuleService;
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly projection: ProjectionDescriptor;
  readonly request: QueryAuditEventsByTenantCommand;
}): Effect.Effect<
  readonly AdminGovernanceAuditEventView[],
  AdminGovernanceServiceError
> =>
  input.auditLog
    .queryByTenant({
      tenantScope: input.request.tenantScope,
      tenantScopeId: input.request.tenantScopeId,
    })
    .pipe(
      Effect.flatMap((records) =>
        projectAdminGovernanceRecords({
          fieldSecurity: input.fieldSecurity,
          moduleId: platformModuleId.auditLog,
          requestContext: input.request.requestContext,
          projection: input.projection,
          records,
          recordType: "auditEvent",
          decode: decodeAdminGovernanceAuditEventView,
        }),
      ),
      Effect.flatMap((projectedRecords) => {
        const auditedFields = collectAuditedFields(projectedRecords);

        return appendSensitiveReadAudit(input.auditLog, {
          requestContext: input.request.requestContext,
          target: `${platformModuleId.auditLog}:tenant:${input.request.tenantScope}:${input.request.tenantScopeId}:events:${auditedFields.join(",")}`,
          reason: `Inspect projected audit-log events for tenant ${input.request.tenantScope}:${input.request.tenantScopeId}.`,
          auditedFields,
        }).pipe(
          Effect.map(() => projectedRecords.map((record) => record.record)),
        );
      }),
    );

const normalizeAuditExportFilter = (
  filter: AdminGovernanceAuditExportFilter,
): AdminGovernanceAuditExportFilter => ({
  ...(filter.moduleId !== undefined ? { moduleId: filter.moduleId } : {}),
  ...(filter.actorId !== undefined ? { actorId: filter.actorId } : {}),
  ...(filter.tenantScope !== undefined
    ? { tenantScope: filter.tenantScope }
    : {}),
  ...(filter.tenantScopeId !== undefined
    ? { tenantScopeId: filter.tenantScopeId }
    : {}),
  ...(filter.target !== undefined ? { target: filter.target } : {}),
  ...(filter.recordedBefore !== undefined
    ? { recordedBefore: filter.recordedBefore }
    : {}),
});

const validateAuditExportFilter = (
  filter: AdminGovernanceAuditExportFilter,
): Effect.Effect<
  AdminGovernanceAuditExportFilter,
  AdminGovernanceAuditExportFilterError
> => {
  const normalizedFilter = normalizeAuditExportFilter(filter);
  const hasTenantScope = normalizedFilter.tenantScope !== undefined;
  const hasTenantScopeId = normalizedFilter.tenantScopeId !== undefined;
  const hasAnchor =
    normalizedFilter.moduleId !== undefined ||
    normalizedFilter.actorId !== undefined ||
    (hasTenantScope && hasTenantScopeId);

  if (!hasAnchor) {
    return Effect.fail({
      _tag: "AdminGovernanceAuditExportFilterError",
      reason:
        "Audit export requires at least one anchor filter: moduleId, actorId, or tenantScope plus tenantScopeId.",
    });
  }

  if (hasTenantScope !== hasTenantScopeId) {
    return Effect.fail({
      _tag: "AdminGovernanceAuditExportFilterError",
      reason:
        "tenantScope and tenantScopeId must be provided together for audit export.",
    });
  }

  if (
    normalizedFilter.target !== undefined &&
    normalizedFilter.moduleId === undefined
  ) {
    return Effect.fail({
      _tag: "AdminGovernanceAuditExportFilterError",
      reason: "Audit export target filters require a moduleId anchor.",
    });
  }

  if (normalizedFilter.recordedBefore === undefined) {
    return Effect.succeed(normalizedFilter);
  }

  return Schema.decodeUnknown(IsoTimestampSchema)(
    normalizedFilter.recordedBefore,
  ).pipe(
    Effect.as(normalizedFilter),
    Effect.mapError(
      (): AdminGovernanceAuditExportFilterError => ({
        _tag: "AdminGovernanceAuditExportFilterError",
        reason: "recordedBefore must be a valid ISO-8601 timestamp.",
      }),
    ),
  );
};

const readAuditEventsForExport = (input: {
  readonly auditLog: AuditLogModuleService;
  readonly filter: AdminGovernanceAuditExportFilter;
}): Effect.Effect<readonly AuditEvent[], AdminGovernanceServiceError> => {
  const { filter } = input;

  if (filter.target !== undefined && filter.moduleId !== undefined) {
    return input.auditLog.queryByTarget({
      moduleId: filter.moduleId,
      target: filter.target,
    });
  }

  if (filter.actorId !== undefined) {
    return input.auditLog.queryByActor({
      actorId: filter.actorId,
    });
  }

  if (filter.tenantScope !== undefined && filter.tenantScopeId !== undefined) {
    return input.auditLog.queryByTenant({
      tenantScope: filter.tenantScope,
      tenantScopeId: filter.tenantScopeId,
    });
  }

  return input.auditLog.queryByModule(filter.moduleId as PlatformModuleId);
};

const filterAuditEventsForExport = (input: {
  readonly records: readonly AuditEvent[];
  readonly filter: AdminGovernanceAuditExportFilter;
}): readonly AuditEvent[] => {
  const recordedBeforeTime =
    input.filter.recordedBefore === undefined
      ? undefined
      : Date.parse(input.filter.recordedBefore);

  return input.records.filter((record) => {
    if (
      input.filter.moduleId !== undefined &&
      record.moduleId !== input.filter.moduleId
    ) {
      return false;
    }

    if (
      input.filter.actorId !== undefined &&
      record.actorId !== input.filter.actorId
    ) {
      return false;
    }

    if (
      input.filter.tenantScope !== undefined &&
      record.tenantScope !== input.filter.tenantScope
    ) {
      return false;
    }

    if (
      input.filter.tenantScopeId !== undefined &&
      record.tenantScopeId !== input.filter.tenantScopeId
    ) {
      return false;
    }

    if (
      input.filter.target !== undefined &&
      record.target !== input.filter.target
    ) {
      return false;
    }

    if (
      recordedBeforeTime !== undefined &&
      Date.parse(record.timestamp) >= recordedBeforeTime
    ) {
      return false;
    }

    return true;
  });
};

const buildAuditExportDescriptor = (
  filter: AdminGovernanceAuditExportFilter,
): string =>
  [
    ...(filter.moduleId !== undefined ? [`module:${filter.moduleId}`] : []),
    ...(filter.actorId !== undefined ? [`actor:${filter.actorId}`] : []),
    ...(filter.tenantScope !== undefined && filter.tenantScopeId !== undefined
      ? [`tenant:${filter.tenantScope}:${filter.tenantScopeId}`]
      : []),
    ...(filter.target !== undefined ? [`target:${filter.target}`] : []),
    ...(filter.recordedBefore !== undefined
      ? [`before:${filter.recordedBefore}`]
      : []),
  ].join("|");

const exportProjectedAuditEvents = (input: {
  readonly auditLog: AuditLogModuleService;
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly projection: ProjectionDescriptor;
  readonly request: ExportAuditEventsCommand;
}): Effect.Effect<
  AdminGovernanceAuditExportView,
  AdminGovernanceServiceError
> =>
  validateAuditExportFilter(input.request.filter).pipe(
    Effect.flatMap((filter) =>
      readAuditEventsForExport({
        auditLog: input.auditLog,
        filter,
      }).pipe(
        Effect.map((records) =>
          filterAuditEventsForExport({
            records,
            filter,
          }),
        ),
        Effect.flatMap((records) =>
          projectAdminGovernanceRecords({
            fieldSecurity: input.fieldSecurity,
            moduleId: platformModuleId.auditLog,
            requestContext: input.request.requestContext,
            projection: input.projection,
            records,
            recordType: "auditEvent",
            decode: decodeAdminGovernanceAuditEventView,
          }).pipe(
            Effect.flatMap((projectedRecords) => {
              const auditedFields = collectAuditedFields(projectedRecords);

              return appendSensitiveReadAudit(input.auditLog, {
                requestContext: input.request.requestContext,
                target: `${platformModuleId.auditLog}:export:${buildAuditExportDescriptor(filter)}:events:${auditedFields.join(",")}`,
                reason: `Export projected audit-log events for ${buildAuditExportDescriptor(filter)}.`,
                auditedFields,
              }).pipe(
                Effect.flatMap(() =>
                  input.auditLog.append({
                    requestContext: input.request.requestContext,
                    moduleId: platformModuleId.auditLog,
                    action: auditLogAuditAction.exported,
                    target: `export:${buildAuditExportDescriptor(filter)}:records:${projectedRecords.length}`,
                    reason: `Export projected audit-log events for ${buildAuditExportDescriptor(filter)}.`,
                  }),
                ),
                Effect.map(() => ({
                  exportedAt: new Date().toISOString(),
                  recordCount: projectedRecords.length,
                  filter,
                  events: projectedRecords.map((record) => record.record),
                })),
              );
            }),
          ),
        ),
      ),
    ),
  );

const projectRuntimeConfigProposalMutationResponse = (input: {
  readonly auditLog: AuditLogModuleService;
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly requestContext:
    | SubmitRuntimeConfigOverrideProposalCommand["requestContext"]
    | ReviewRuntimeConfigProposalCommand["requestContext"];
  readonly runtimeConfigProjection: ProjectionDescriptor;
  readonly auditLogProjection: ProjectionDescriptor;
  readonly result: {
    readonly proposal: RuntimeConfigGovernanceProposalRecord;
    readonly auditEvent: AuditEvent;
  };
}): Effect.Effect<
  | AdminGovernanceReviewRuntimeConfigProposalResponse
  | AdminGovernanceSubmitRuntimeConfigOverrideProposalResponse,
  AdminGovernanceServiceError
> =>
  Effect.all({
    projectedProposal: applyProjectedAdminGovernanceRecord({
      fieldSecurity: input.fieldSecurity,
      moduleId: platformModuleId.runtimeConfig,
      requestContext: input.requestContext,
      projection: input.runtimeConfigProjection,
      record: input.result.proposal,
      recordType: "runtimeConfigProposal",
      decode: decodeAdminGovernanceRuntimeConfigProposalView,
    }),
    projectedAuditEvent: applyProjectedAdminGovernanceRecord({
      fieldSecurity: input.fieldSecurity,
      moduleId: platformModuleId.auditLog,
      requestContext: input.requestContext,
      projection: input.auditLogProjection,
      record: input.result.auditEvent,
      recordType: "auditEvent",
      decode: decodeAdminGovernanceAuditEventView,
    }),
  }).pipe(
    Effect.flatMap(({ projectedProposal, projectedAuditEvent }) =>
      Effect.all([
        appendSensitiveReadAudit(input.auditLog, {
          requestContext: input.requestContext,
          target: `${platformModuleId.runtimeConfig}:${input.result.proposal.moduleId}:proposal-mutation:${projectedProposal.auditedFields.join(",")}`,
          reason: `Inspect projected runtime-config proposal mutation response for ${input.result.proposal.moduleId}.`,
          auditedFields: projectedProposal.auditedFields,
        }),
        appendSensitiveReadAudit(input.auditLog, {
          requestContext: input.requestContext,
          target: `${platformModuleId.auditLog}:${input.result.proposal.moduleId}:proposal-mutation:${projectedAuditEvent.auditedFields.join(",")}`,
          reason: `Inspect projected audit-log proposal mutation response for ${input.result.proposal.moduleId}.`,
          auditedFields: projectedAuditEvent.auditedFields,
        }),
      ]).pipe(
        Effect.map(() => ({
          proposal: projectedProposal.record,
          auditEvent: projectedAuditEvent.record,
        })),
      ),
    ),
  );

const persistProjectedRuntimeConfigProposals = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly auditLog: AuditLogModuleService;
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly projection: ProjectionDescriptor;
  readonly request: PersistRuntimeConfigProposalsCommand;
}): Effect.Effect<
  readonly AdminGovernanceRuntimeConfigProposalView[],
  AdminGovernanceServiceError
> =>
  input.runtimeConfig
    .persistChangeProposals({
      moduleId: input.request.moduleId,
      renameMap: input.request.renameMap,
    })
    .pipe(
      Effect.flatMap((records) =>
        projectAdminGovernanceRecords({
          fieldSecurity: input.fieldSecurity,
          moduleId: platformModuleId.runtimeConfig,
          requestContext: input.request.requestContext,
          projection: input.projection,
          records,
          recordType: "runtimeConfigProposal",
          decode: decodeAdminGovernanceRuntimeConfigProposalView,
        }),
      ),
      Effect.flatMap((projectedRecords) => {
        const auditedFields = collectAuditedFields(projectedRecords);

        return appendSensitiveReadAudit(input.auditLog, {
          requestContext: input.request.requestContext,
          target: `${platformModuleId.runtimeConfig}:${input.request.moduleId}:persisted-proposals:${auditedFields.join(",")}`,
          reason: `Inspect projected persisted runtime-config proposals for ${input.request.moduleId}.`,
          auditedFields,
        }).pipe(
          Effect.map(() => projectedRecords.map((record) => record.record)),
        );
      }),
    );

const submitRuntimeConfigOverrideProposal = (
  proposalPersistence: AdminGovernanceRuntimeConfigProposalPersistence,
  auditLog: AuditLogModuleService,
  fieldSecurity: AdminGovernanceFieldSecurity,
  runtimeConfigProjection: ProjectionDescriptor,
  auditLogProjection: ProjectionDescriptor,
  input: SubmitRuntimeConfigOverrideProposalCommand,
): Effect.Effect<
  AdminGovernanceSubmitRuntimeConfigOverrideProposalResponse,
  AdminGovernanceServiceError
> =>
  Schema.decodeUnknown(SubmitRuntimeConfigOverrideProposalCommandSchema)(
    input,
  ).pipe(
    Effect.flatMap((request) =>
      ensureAdminGovernanceMutationAccess(request.requestContext).pipe(
        Effect.flatMap((requestContext) =>
          Effect.flatMap(validateRuntimeGovernedOverrideProposal(request), () =>
            proposalPersistence
              .persistSubmittedOverrideProposal({
                requestContext,
                moduleId: request.moduleId,
                key: request.key,
                scope: request.scope,
                scopeId: request.scopeId,
                value: request.value,
                approvalReason: request.approvalReason,
              })
              .pipe(
                Effect.flatMap((result) =>
                  projectRuntimeConfigProposalMutationResponse({
                    auditLog,
                    fieldSecurity,
                    requestContext,
                    runtimeConfigProjection,
                    auditLogProjection,
                    result,
                  }),
                ),
              ),
          ),
        ),
      ),
    ),
  );

const writeAuthorizationTuple = (
  tupleWriter: AdminGovernanceAuthorizationTupleWriter,
  auditLog: AuditLogModuleService,
  fieldSecurity: AdminGovernanceFieldSecurity,
  authorizationProjection: ProjectionDescriptor,
  auditLogProjection: ProjectionDescriptor,
  input: WriteAuthorizationTupleCommand,
): Effect.Effect<
  AdminGovernanceWriteAuthorizationTupleResponse,
  AdminGovernanceServiceError
> =>
  Schema.decodeUnknown(WriteAuthorizationTupleCommandSchema)(input).pipe(
    Effect.flatMap((request) =>
      ensureAdminGovernanceMutationAccess(request.requestContext).pipe(
        Effect.flatMap((requestContext) =>
          tupleWriter(request.tuple).pipe(
            Effect.flatMap(decodeAdminGovernanceAuthorizationTupleView),
            Effect.flatMap((tuple) =>
              auditLog
                .append({
                  requestContext: {
                    ...requestContext,
                    reason: request.reason,
                  },
                  moduleId: platformModuleId.authorization,
                  action: authorizationAuditAction.tupleChanged,
                  target: buildAuthorizationTupleTarget(tuple),
                  reason: request.reason,
                })
                .pipe(
                  Effect.flatMap((auditEvent) =>
                    projectAuthorizationTupleMutationResponse({
                      auditLog,
                      fieldSecurity,
                      requestContext,
                      authorizationProjection,
                      auditLogProjection,
                      tuple,
                      auditEvent,
                    }),
                  ),
                ),
            ),
          ),
        ),
      ),
    ),
  );

const reviewRuntimeConfigProposal = (
  runtimeConfig: RuntimeConfigModuleService,
  proposalPersistence: AdminGovernanceRuntimeConfigProposalPersistence,
  auditLog: AuditLogModuleService,
  fieldSecurity: AdminGovernanceFieldSecurity,
  runtimeConfigProjection: ProjectionDescriptor,
  auditLogProjection: ProjectionDescriptor,
  input: ReviewRuntimeConfigProposalCommand,
): Effect.Effect<
  AdminGovernanceReviewRuntimeConfigProposalResponse,
  AdminGovernanceServiceError
> =>
  Schema.decodeUnknown(ReviewRuntimeConfigProposalCommandSchema)(input).pipe(
    Effect.flatMap((request) =>
      ensureAdminGovernanceMutationAccess(request.requestContext).pipe(
        Effect.flatMap((requestContext) =>
          Effect.flatMap(
            validateApprovedRuntimeGovernedOverrideReview(
              runtimeConfig,
              request,
            ),
            () =>
              proposalPersistence
                .persistReviewedProposal({
                  requestContext,
                  proposalId: request.proposalId,
                  status: request.status,
                  decisionReason: request.decisionReason,
                })
                .pipe(
                  Effect.flatMap((result) =>
                    projectRuntimeConfigProposalMutationResponse({
                      auditLog,
                      fieldSecurity,
                      requestContext,
                      runtimeConfigProjection,
                      auditLogProjection,
                      result,
                    }),
                  ),
                ),
          ),
        ),
      ),
    ),
  );

export const makeAdminGovernanceService = (
  proposalPersistence: AdminGovernanceRuntimeConfigProposalPersistence,
  options: {
    readonly authorization: AdminGovernanceAuthorization;
    readonly writeAuthorizationTuple: AdminGovernanceAuthorizationTupleWriter;
  },
) =>
  Effect.gen(function* () {
    const runtimeConfig = yield* RuntimeConfigModule;
    const auditLog = yield* AuditLogPostgresRepository.pipe(
      Effect.flatMap(makeAuditLogModule),
    );
    const fieldSecurity = yield* makeFieldSecurityModule();
    const valkey = yield* ValkeyAdapter;
    const runtimeConfigAdminProjection =
      yield* resolveAdminGovernanceProjection(platformModuleId.runtimeConfig);
    const featureFlagsAdminProjection = yield* resolveAdminGovernanceProjection(
      platformModuleId.featureFlags,
    );
    const auditLogAdminProjection = yield* resolveAdminGovernanceProjection(
      platformModuleId.auditLog,
    );
    const authorizationAdminProjection =
      yield* resolveAdminGovernanceProjection(platformModuleId.authorization);
    const billingState = yield* BillingStatePostgresRepository;

    return {
      resolveRequestContext: (input: AdminGovernanceSessionLookup) =>
        resolveAdminGovernanceRequestContext(valkey, input),
      listRuntimeConfigOverrides: (input: AdminGovernanceListByModuleRequest) =>
        Schema.decodeUnknown(AdminGovernanceListByModuleRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            ensureAdminGovernanceReadAccess(request.requestContext).pipe(
              Effect.flatMap(() =>
                listProjectedRuntimeConfigOverrides({
                  runtimeConfig,
                  auditLog,
                  fieldSecurity,
                  projection: runtimeConfigAdminProjection,
                  request,
                }),
              ),
            ),
          ),
        ),
      listFeatureFlags: (input: AdminGovernanceListByModuleRequest) =>
        Schema.decodeUnknown(AdminGovernanceListByModuleRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            ensureAdminGovernanceReadAccess(request.requestContext).pipe(
              Effect.flatMap(() =>
                listProjectedFeatureFlags({
                  runtimeConfig,
                  billingState,
                  auditLog,
                  fieldSecurity,
                  projection: featureFlagsAdminProjection,
                  request,
                }),
              ),
            ),
          ),
        ),
      inspectAuthorization: (input: InspectAuthorizationCommand) =>
        Schema.decodeUnknown(InspectAuthorizationCommandSchema)(input).pipe(
          Effect.flatMap((request) =>
            ensureAdminGovernanceReadAccess(request.requestContext).pipe(
              Effect.flatMap(() =>
                inspectProjectedAuthorization({
                  authorization: options.authorization,
                  auditLog,
                  fieldSecurity,
                  projection: authorizationAdminProjection,
                  request,
                }),
              ),
            ),
          ),
        ),
      writeAuthorizationTuple: (input: WriteAuthorizationTupleCommand) =>
        writeAuthorizationTuple(
          options.writeAuthorizationTuple,
          auditLog,
          fieldSecurity,
          authorizationAdminProjection,
          auditLogAdminProjection,
          input,
        ),
      submitRuntimeConfigOverrideProposal: (
        input: SubmitRuntimeConfigOverrideProposalCommand,
      ): Effect.Effect<
        AdminGovernanceSubmitRuntimeConfigOverrideProposalResponse,
        AdminGovernanceServiceError
      > =>
        submitRuntimeConfigOverrideProposal(
          proposalPersistence,
          auditLog,
          fieldSecurity,
          runtimeConfigAdminProjection,
          auditLogAdminProjection,
          input,
        ),
      reviewRuntimeConfigProposal: (
        input: ReviewRuntimeConfigProposalCommand,
      ): Effect.Effect<
        AdminGovernanceReviewRuntimeConfigProposalResponse,
        AdminGovernanceServiceError
      > =>
        reviewRuntimeConfigProposal(
          runtimeConfig,
          proposalPersistence,
          auditLog,
          fieldSecurity,
          runtimeConfigAdminProjection,
          auditLogAdminProjection,
          input,
        ),
      persistRuntimeConfigProposals: (
        input: PersistRuntimeConfigProposalsCommand,
      ): Effect.Effect<
        readonly AdminGovernanceRuntimeConfigProposalView[],
        AdminGovernanceServiceError
      > =>
        Schema.decodeUnknown(PersistRuntimeConfigProposalsCommandSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            ensureAdminGovernanceMutationAccess(request.requestContext).pipe(
              Effect.flatMap((requestContext) =>
                persistProjectedRuntimeConfigProposals({
                  runtimeConfig,
                  auditLog,
                  fieldSecurity,
                  projection: runtimeConfigAdminProjection,
                  request: {
                    ...request,
                    requestContext,
                  },
                }),
              ),
            ),
          ),
        ),
      listRuntimeConfigProposals: (input: AdminGovernanceListByModuleRequest) =>
        Schema.decodeUnknown(AdminGovernanceListByModuleRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            ensureAdminGovernanceReadAccess(request.requestContext).pipe(
              Effect.flatMap(() =>
                listProjectedRuntimeConfigProposals({
                  runtimeConfig,
                  auditLog,
                  fieldSecurity,
                  projection: runtimeConfigAdminProjection,
                  request,
                }),
              ),
            ),
          ),
        ),
      queryAuditEventsByModule: (input: AdminGovernanceListByModuleRequest) =>
        Schema.decodeUnknown(AdminGovernanceListByModuleRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            ensureAdminGovernanceReadAccess(request.requestContext).pipe(
              Effect.flatMap(() =>
                listProjectedAuditEvents({
                  auditLog,
                  fieldSecurity,
                  projection: auditLogAdminProjection,
                  request,
                }),
              ),
            ),
          ),
        ),
      queryAuditEventsByTarget: (input: QueryAuditEventsByTargetCommand) =>
        Schema.decodeUnknown(QueryAuditEventsByTargetCommandSchema)(input).pipe(
          Effect.flatMap((request) =>
            ensureAdminGovernanceReadAccess(request.requestContext).pipe(
              Effect.flatMap(() =>
                listProjectedAuditEventsByTarget({
                  auditLog,
                  fieldSecurity,
                  projection: auditLogAdminProjection,
                  request,
                }),
              ),
            ),
          ),
        ),
      queryAuditEventsByActor: (input: QueryAuditEventsByActorCommand) =>
        Schema.decodeUnknown(QueryAuditEventsByActorCommandSchema)(input).pipe(
          Effect.flatMap((request) =>
            ensureAdminGovernanceReadAccess(request.requestContext).pipe(
              Effect.flatMap(() =>
                listProjectedAuditEventsByActor({
                  auditLog,
                  fieldSecurity,
                  projection: auditLogAdminProjection,
                  request,
                }),
              ),
            ),
          ),
        ),
      queryAuditEventsByTenant: (input: QueryAuditEventsByTenantCommand) =>
        Schema.decodeUnknown(QueryAuditEventsByTenantCommandSchema)(input).pipe(
          Effect.flatMap((request) =>
            ensureAdminGovernanceReadAccess(request.requestContext).pipe(
              Effect.flatMap(() =>
                listProjectedAuditEventsByTenant({
                  auditLog,
                  fieldSecurity,
                  projection: auditLogAdminProjection,
                  request,
                }),
              ),
            ),
          ),
        ),
      exportAuditEvents: (input: ExportAuditEventsCommand) =>
        Schema.decodeUnknown(ExportAuditEventsCommandSchema)(input).pipe(
          Effect.flatMap((request) =>
            ensureAdminGovernanceReadAccess(request.requestContext).pipe(
              Effect.flatMap(() =>
                exportProjectedAuditEvents({
                  auditLog,
                  fieldSecurity,
                  projection: auditLogAdminProjection,
                  request,
                }),
              ),
            ),
          ),
        ),
    } satisfies AdminGovernanceService;
  });

const makeAdminGovernanceRuntime = (options: AdminGovernanceRuntimeOptions) =>
  Effect.gen(function* () {
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
    const valkey = yield* makeValkeyAdapter({
      url: options.valkeyUrl,
    });
    const unleash = yield* makeUnleashAdapter({
      url: options.unleashUrl,
      apiKey: options.unleashApiKey,
    });
    const oryKeto = yield* makeOryKetoAdapter({
      readUrl: options.ketoReadUrl,
      writeUrl: options.ketoWriteUrl,
    });
    const writeDatabase = buildWriteDatabase(postgres.database);
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
    const billingStateQueryable: BillingStatePostgresQueryable = {
      listEntitlementsByScope: (scope, scopeId) =>
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
    const auditLogQueryable: AuditLogPostgresQueryable = {
      listEventsByModule: (moduleId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.moduleId, moduleId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTarget: (input) =>
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
      listEventsByActor: (actorId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.actorId, actorId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTenant: (input) =>
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
    const runtimeConfigRepository = yield* makeRuntimeConfigPostgresRepository({
      ...writeDatabase,
      ...runtimeConfigQueryable,
    });
    const billingStateRepository = yield* makeBillingStatePostgresRepository(
      billingStateQueryable,
    );
    const auditLogRepository = yield* makeAuditLogPostgresRepository({
      ...writeDatabase,
      ...auditLogQueryable,
    });
    const runtimeConfig = yield* makeRuntimeConfigModule(
      runtimeConfigRepository,
      makeRuntimeFeatureFlagRollout(unleash),
    );
    const authorization = yield* makeAuthorizationModule({
      tuples: [],
      cacheTtlSeconds: 60,
      maxCacheSize: 128,
      delegatedCheck: createOryKetoAuthorizationDelegatedCheck(oryKeto),
      delegatedTupleLookup:
        createOryKetoAuthorizationDelegatedTupleLookup(oryKeto),
    });
    const proposalPersistence = {
      persistSubmittedOverrideProposal: ({
        requestContext,
        moduleId,
        key,
        scope,
        scopeId,
        value,
        approvalReason,
      }) =>
        buildSubmittedRuntimeConfigOverrideProposal(
          {
            requestContext,
            moduleId,
            key,
            scope,
            scopeId,
            value,
            approvalReason,
          },
          requestContext.actorId,
        ).pipe(
          Effect.flatMap((proposal) =>
            Effect.tryPromise({
              try: async () =>
                postgres.database.transaction(async (tx) => {
                  await tx
                    .insert(runtimeConfigOverrideProposalsTable)
                    .values({
                      proposalId: proposal.proposalId,
                      moduleId: proposal.moduleId,
                      key: proposal.key,
                      scope: proposal.scope,
                      scopeId: proposal.scopeId,
                      value: proposal.value,
                      source: proposal.source,
                      changedBy: proposal.changedBy,
                      changedAt: new Date(proposal.changedAt),
                      approvalReason: proposal.approvalReason,
                      status: runtimeConfigSyncArtifactStatus.pending,
                    })
                    .onConflictDoUpdate({
                      target: [runtimeConfigOverrideProposalsTable.proposalId],
                      set: {
                        moduleId: proposal.moduleId,
                        key: proposal.key,
                        scope: proposal.scope,
                        scopeId: proposal.scopeId,
                        value: proposal.value,
                        source: proposal.source,
                        changedBy: proposal.changedBy,
                        changedAt: new Date(proposal.changedAt),
                        approvalReason: proposal.approvalReason,
                        status: runtimeConfigSyncArtifactStatus.pending,
                        decidedBy: null,
                        decisionReason: null,
                        decidedAt: null,
                      },
                    })
                    .execute();

                  const storedRows = await tx
                    .select()
                    .from(runtimeConfigOverrideProposalsTable)
                    .where(
                      eq(
                        runtimeConfigOverrideProposalsTable.proposalId,
                        proposal.proposalId,
                      ),
                    );

                  const storedRow = storedRows[0];

                  if (storedRow === undefined) {
                    throw {
                      _tag: "RuntimeConfigOverrideProposalNotFoundError",
                      proposalId: proposal.proposalId,
                    } as const;
                  }

                  const storedProposal = await Effect.runPromise(
                    buildStoredRuntimeConfigOverrideProposal(storedRow),
                  );

                  const auditEvent = await Effect.runPromise(
                    buildAuditEvent({
                      requestContext: {
                        ...requestContext,
                        reason: approvalReason,
                      },
                      moduleId: storedProposal.moduleId,
                      action: runtimeConfigAuditAction.overrideProposed,
                      target: buildRuntimeConfigProposalTarget(storedProposal),
                      reason: approvalReason,
                    }),
                  );

                  await tx
                    .insert(auditLogEventsTable)
                    .values({
                      eventId: auditEvent.eventId,
                      moduleId: auditEvent.moduleId,
                      action: auditEvent.action,
                      target: auditEvent.target,
                      actorId: auditEvent.actorId,
                      tenantScope: auditEvent.tenantScope,
                      tenantScopeId: auditEvent.tenantScopeId,
                      reason: auditEvent.reason ?? null,
                      correlationId: auditEvent.correlationId ?? null,
                      requestContext: {},
                    })
                    .onConflictDoUpdate({
                      target: [auditLogEventsTable.eventId],
                      set: {
                        action: auditEvent.action,
                        target: auditEvent.target,
                        reason: auditEvent.reason ?? null,
                        correlationId: auditEvent.correlationId ?? null,
                      },
                    })
                    .execute();

                  return {
                    proposal: storedProposal,
                    auditEvent,
                  };
                }),
              catch: (cause) => {
                if (
                  typeof cause === "object" &&
                  cause !== null &&
                  "_tag" in cause &&
                  cause._tag === "RuntimeConfigOverrideProposalNotFoundError"
                ) {
                  return cause as RuntimeConfigModulePersistenceError;
                }

                return {
                  _tag: "AdminGovernanceProposalPersistenceError",
                  cause,
                } satisfies AdminGovernanceProposalPersistenceError;
              },
            }),
          ),
        ),
      persistReviewedProposal: ({
        requestContext,
        proposalId,
        status,
        decisionReason,
      }) =>
        buildReviewedRuntimeConfigProposal(
          {
            requestContext,
            proposalId,
            status,
            decisionReason,
          },
          requestContext.actorId,
        ).pipe(
          Effect.flatMap((review) =>
            Effect.tryPromise({
              try: async () =>
                postgres.database.transaction(async (tx) => {
                  if (proposalId.endsWith(":override")) {
                    const nextStatus =
                      review.status === runtimeConfigSyncArtifactStatus.approved
                        ? runtimeConfigSyncArtifactStatus.applied
                        : runtimeConfigSyncArtifactStatus.rejected;

                    const updatedRows = await tx
                      .update(runtimeConfigOverrideProposalsTable)
                      .set({
                        status: nextStatus,
                        decidedBy: review.decidedBy,
                        decisionReason: review.decisionReason,
                        decidedAt: new Date(review.decidedAt),
                      })
                      .where(
                        and(
                          eq(
                            runtimeConfigOverrideProposalsTable.proposalId,
                            proposalId,
                          ),
                          eq(
                            runtimeConfigOverrideProposalsTable.status,
                            runtimeConfigSyncArtifactStatus.pending,
                          ),
                        ),
                      )
                      .returning();

                    const updatedRow = updatedRows[0];

                    if (updatedRow === undefined) {
                      const currentRows = await tx
                        .select()
                        .from(runtimeConfigOverrideProposalsTable)
                        .where(
                          eq(
                            runtimeConfigOverrideProposalsTable.proposalId,
                            proposalId,
                          ),
                        );

                      const currentRow = currentRows[0];

                      if (currentRow !== undefined) {
                        throw {
                          _tag: "AdminGovernanceProposalReviewConflictError",
                          proposalId,
                          status:
                            currentRow.status as RuntimeConfigGovernanceProposalRecord["status"],
                        } satisfies AdminGovernanceProposalReviewConflictError;
                      }

                      throw {
                        _tag: "RuntimeConfigOverrideProposalNotFoundError",
                        proposalId,
                      } as const;
                    }

                    const proposal = await Effect.runPromise(
                      buildStoredRuntimeConfigOverrideProposal(updatedRow),
                    );

                    if (
                      review.status === runtimeConfigSyncArtifactStatus.approved
                    ) {
                      await Effect.runPromise(
                        validateRuntimeGovernedOverrideProposal(proposal),
                      );

                      const override = await Effect.runPromise(
                        buildStoredRuntimeConfigOverride({
                          proposal,
                          actorId: requestContext.actorId,
                          changedAt: review.decidedAt,
                        }),
                      );

                      await tx
                        .insert(runtimeConfigOverridesTable)
                        .values({
                          overrideId:
                            buildRuntimeConfigOverrideTarget(override),
                          moduleId: override.moduleId,
                          key: override.key,
                          scope: override.scope,
                          scopeId: override.scopeId,
                          value: override.value,
                          source: override.source,
                          changedBy: override.changedBy,
                          approvalReason: override.approvalReason ?? null,
                          changedAt: new Date(override.changedAt),
                        })
                        .onConflictDoUpdate({
                          target: [
                            runtimeConfigOverridesTable.moduleId,
                            runtimeConfigOverridesTable.key,
                            runtimeConfigOverridesTable.scope,
                            runtimeConfigOverridesTable.scopeId,
                          ],
                          set: {
                            value: override.value,
                            source: override.source,
                            changedBy: override.changedBy,
                            approvalReason: override.approvalReason ?? null,
                            changedAt: new Date(override.changedAt),
                          },
                        })
                        .execute();

                      const overrideChangedAuditEvent = await Effect.runPromise(
                        buildAuditEvent({
                          requestContext: {
                            ...requestContext,
                            reason: decisionReason,
                          },
                          moduleId: override.moduleId,
                          action: runtimeConfigAuditAction.overrideChanged,
                          target: buildRuntimeConfigOverrideTarget(override),
                          reason: decisionReason,
                        }),
                      );

                      await tx
                        .insert(auditLogEventsTable)
                        .values({
                          eventId: overrideChangedAuditEvent.eventId,
                          moduleId: overrideChangedAuditEvent.moduleId,
                          action: overrideChangedAuditEvent.action,
                          target: overrideChangedAuditEvent.target,
                          actorId: overrideChangedAuditEvent.actorId,
                          tenantScope: overrideChangedAuditEvent.tenantScope,
                          tenantScopeId:
                            overrideChangedAuditEvent.tenantScopeId,
                          reason: overrideChangedAuditEvent.reason ?? null,
                          correlationId:
                            overrideChangedAuditEvent.correlationId ?? null,
                          requestContext: {},
                        })
                        .onConflictDoUpdate({
                          target: [auditLogEventsTable.eventId],
                          set: {
                            action: overrideChangedAuditEvent.action,
                            target: overrideChangedAuditEvent.target,
                            reason: overrideChangedAuditEvent.reason ?? null,
                            correlationId:
                              overrideChangedAuditEvent.correlationId ?? null,
                          },
                        })
                        .execute();
                    }

                    const auditEvent = await Effect.runPromise(
                      buildAuditEvent({
                        requestContext: {
                          ...requestContext,
                          reason: decisionReason,
                        },
                        moduleId: proposal.moduleId,
                        action: runtimeConfigAuditAction.proposalReviewed,
                        target: buildRuntimeConfigProposalTarget(proposal),
                        reason: decisionReason,
                      }),
                    );

                    await tx
                      .insert(auditLogEventsTable)
                      .values({
                        eventId: auditEvent.eventId,
                        moduleId: auditEvent.moduleId,
                        action: auditEvent.action,
                        target: auditEvent.target,
                        actorId: auditEvent.actorId,
                        tenantScope: auditEvent.tenantScope,
                        tenantScopeId: auditEvent.tenantScopeId,
                        reason: auditEvent.reason ?? null,
                        correlationId: auditEvent.correlationId ?? null,
                        requestContext: {},
                      })
                      .onConflictDoUpdate({
                        target: [auditLogEventsTable.eventId],
                        set: {
                          action: auditEvent.action,
                          target: auditEvent.target,
                          reason: auditEvent.reason ?? null,
                          correlationId: auditEvent.correlationId ?? null,
                        },
                      })
                      .execute();

                    return {
                      proposal,
                      auditEvent,
                    };
                  }

                  const updatedRows = await tx
                    .update(runtimeConfigSyncArtifactsTable)
                    .set({
                      status: review.status,
                      decidedBy: review.decidedBy,
                      decisionReason: review.decisionReason,
                      decidedAt: new Date(review.decidedAt),
                    })
                    .where(
                      and(
                        eq(
                          runtimeConfigSyncArtifactsTable.proposalId,
                          proposalId,
                        ),
                        eq(
                          runtimeConfigSyncArtifactsTable.status,
                          runtimeConfigSyncArtifactStatus.pending,
                        ),
                      ),
                    )
                    .returning();

                  const updatedRow = updatedRows[0];

                  if (updatedRow === undefined) {
                    const currentRows = await tx
                      .select()
                      .from(runtimeConfigSyncArtifactsTable)
                      .where(
                        eq(
                          runtimeConfigSyncArtifactsTable.proposalId,
                          proposalId,
                        ),
                      );

                    const currentRow = currentRows[0];

                    if (currentRow !== undefined) {
                      throw {
                        _tag: "AdminGovernanceProposalReviewConflictError",
                        proposalId,
                        status:
                          currentRow.status as RuntimeConfigGovernanceProposalRecord["status"],
                      } satisfies AdminGovernanceProposalReviewConflictError;
                    }

                    throw {
                      _tag: "RuntimeConfigSyncArtifactNotFoundError",
                      proposalId,
                    } as const;
                  }

                  const proposal = await Effect.runPromise(
                    buildStoredRuntimeConfigSyncProposal(updatedRow),
                  );

                  const auditEvent = await Effect.runPromise(
                    buildAuditEvent({
                      requestContext: {
                        ...requestContext,
                        reason: decisionReason,
                      },
                      moduleId: proposal.moduleId,
                      action: runtimeConfigAuditAction.proposalReviewed,
                      target: buildRuntimeConfigProposalTarget({ proposalId }),
                      reason: decisionReason,
                    }),
                  );

                  await tx
                    .insert(auditLogEventsTable)
                    .values({
                      eventId: auditEvent.eventId,
                      moduleId: auditEvent.moduleId,
                      action: auditEvent.action,
                      target: auditEvent.target,
                      actorId: auditEvent.actorId,
                      tenantScope: auditEvent.tenantScope,
                      tenantScopeId: auditEvent.tenantScopeId,
                      reason: auditEvent.reason ?? null,
                      correlationId: auditEvent.correlationId ?? null,
                      requestContext: {},
                    })
                    .onConflictDoUpdate({
                      target: [auditLogEventsTable.eventId],
                      set: {
                        action: auditEvent.action,
                        target: auditEvent.target,
                        reason: auditEvent.reason ?? null,
                        correlationId: auditEvent.correlationId ?? null,
                      },
                    })
                    .execute();

                  return {
                    proposal,
                    auditEvent,
                  };
                }),
              catch: (cause) => {
                if (
                  typeof cause === "object" &&
                  cause !== null &&
                  "_tag" in cause &&
                  cause._tag === "AdminGovernanceProposalReviewConflictError"
                ) {
                  return cause as AdminGovernanceProposalReviewConflictError;
                }

                if (
                  typeof cause === "object" &&
                  cause !== null &&
                  "_tag" in cause &&
                  cause._tag ===
                    "AdminGovernanceRuntimeGovernedOverrideValidationError"
                ) {
                  return cause as AdminGovernanceRuntimeGovernedOverrideValidationError;
                }

                if (
                  typeof cause === "object" &&
                  cause !== null &&
                  "_tag" in cause &&
                  (cause._tag === "RuntimeConfigSyncArtifactNotFoundError" ||
                    cause._tag === "RuntimeConfigOverrideProposalNotFoundError")
                ) {
                  return cause as RuntimeConfigModulePersistenceError;
                }

                return {
                  _tag: "AdminGovernanceProposalPersistenceError",
                  cause,
                } satisfies AdminGovernanceProposalPersistenceError;
              },
            }),
          ),
        ),
    } satisfies AdminGovernanceRuntimeConfigProposalPersistence;
    const service = yield* makeAdminGovernanceService(proposalPersistence, {
      authorization,
      writeAuthorizationTuple: oryKeto.writeTuple,
    }).pipe(
      Effect.provideService(RuntimeConfigModule, runtimeConfig),
      Effect.provideService(
        BillingStatePostgresRepository,
        billingStateRepository,
      ),
      Effect.provideService(AuditLogPostgresRepository, auditLogRepository),
      Effect.provideService(ValkeyAdapter, valkey),
    );

    return {
      service,
      close: Effect.all([
        Effect.ignore(postgres.close),
        Effect.ignore(unleash.close),
        Effect.ignore(valkey.close),
      ]),
    };
  });

const runAdminGovernanceWithResolvedOptions = <A, E>(
  options: AdminGovernanceRuntimeOptions,
  use: (service: AdminGovernanceService) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeAdminGovernanceRuntime(options);

    return yield* use(runtime.service).pipe(
      Effect.ensuring(Effect.ignore(runtime.close)),
    );
  });

export const resolveAdminGovernanceRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  Schema.decodeUnknown(AdminGovernanceProcessEnvironmentSchema)(
    environment,
  ).pipe(
    Effect.map(
      (resolvedEnvironment): AdminGovernanceRuntimeOptions => ({
        postgresUrl: resolvedEnvironment.POSTGRES_URL,
        valkeyUrl: resolvedEnvironment.VALKEY_URL,
        unleashUrl: resolvedEnvironment.UNLEASH_URL,
        unleashApiKey: resolvedEnvironment.UNLEASH_API_KEY,
        ketoReadUrl: resolvedEnvironment.KETO_READ_URL,
        ketoWriteUrl: resolvedEnvironment.KETO_WRITE_URL,
      }),
    ),
  );

export const runAdminGovernanceFromOptions = <A, E>(
  options: AdminGovernanceRuntimeOptions,
  use: (service: AdminGovernanceService) => Effect.Effect<A, E>,
) =>
  Schema.decodeUnknown(AdminGovernanceRuntimeOptionsSchema)(options).pipe(
    Effect.flatMap((resolvedOptions) =>
      runAdminGovernanceWithResolvedOptions(resolvedOptions, use),
    ),
  );

export const runAdminGovernanceFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: AdminGovernanceService) => Effect.Effect<A, E>,
) =>
  resolveAdminGovernanceRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((resolvedOptions) =>
      runAdminGovernanceWithResolvedOptions(resolvedOptions, use),
    ),
  );
