import { Effect } from "effect";
import type {
  AdminGovernanceExportAuditEventsRequest,
  AdminGovernanceInspectAuthorizationRequest,
  AdminGovernanceQueryAuditEventsByActorRequest,
  AdminGovernanceQueryAuditEventsByTargetRequest,
  AdminGovernanceQueryAuditEventsByTenantRequest,
  AdminGovernanceReadBySessionRequest,
  AdminGovernanceService,
  AdminGovernanceServiceError,
  AdminGovernanceWriteAuthorizationTupleRequest,
  PersistRuntimeConfigProposalsRequest,
  ReviewRuntimeConfigProposalRequest,
  SubmitRuntimeConfigOverrideProposalRequest,
} from "../governance/admin-governance";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

const loadAdminGovernanceRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../governance/admin-governance"));

const withAdminGovernanceSession = <A, E>(
  environment: unknown,
  sessionId: string,
  use: (input: {
    readonly service: AdminGovernanceService;
    readonly requestContext: Parameters<
      AdminGovernanceService["listRuntimeConfigOverrides"]
    >[0]["requestContext"];
  }) => Effect.Effect<A, E | AdminGovernanceServiceError>,
) =>
  loadAdminGovernanceRuntime().pipe(
    Effect.flatMap(({ runAdminGovernanceFromEnvironment }) =>
      runAdminGovernanceFromEnvironment(environment, (service) =>
        service.resolveRequestContext({ sessionId }).pipe(
          Effect.flatMap((requestContext) =>
            use({
              service,
              requestContext,
            }),
          ),
        ),
      ),
    ),
  );

export const listAdminRuntimeConfigOverridesFromEnvironment = (
  environment: unknown,
  input: AdminGovernanceReadBySessionRequest,
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ service, requestContext }) =>
      service.listRuntimeConfigOverrides({
        requestContext,
        moduleId: input.moduleId,
      }),
  );

export const listAdminFeatureFlagsFromEnvironment = (
  environment: unknown,
  input: AdminGovernanceReadBySessionRequest,
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ service, requestContext }) =>
      service.listFeatureFlags({
        requestContext,
        moduleId: input.moduleId,
      }),
  );

export const inspectAdminAuthorizationFromEnvironment = (
  environment: unknown,
  input: AdminGovernanceInspectAuthorizationRequest,
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ service, requestContext }) =>
      service.inspectAuthorization({
        requestContext,
        checkInput: input.checkInput,
      }),
  );

export const writeAdminAuthorizationTupleFromEnvironment = (
  environment: unknown,
  input: AdminGovernanceWriteAuthorizationTupleRequest,
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ service, requestContext }) =>
      service.writeAuthorizationTuple({
        requestContext,
        tuple: input.tuple,
        reason: input.reason,
      }),
  );

export const submitAdminRuntimeConfigOverrideProposalFromEnvironment = (
  environment: unknown,
  input: SubmitRuntimeConfigOverrideProposalRequest,
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ service, requestContext }) =>
      service.submitRuntimeConfigOverrideProposal({
        requestContext,
        moduleId: input.moduleId,
        key: input.key,
        scope: input.scope,
        scopeId: input.scopeId,
        value: input.value,
        approvalReason: input.approvalReason,
      }),
  );

export const reviewAdminRuntimeConfigProposalFromEnvironment = (
  environment: unknown,
  input: ReviewRuntimeConfigProposalRequest,
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ service, requestContext }) =>
      service.reviewRuntimeConfigProposal({
        requestContext,
        proposalId: input.proposalId,
        status: input.status,
        decisionReason: input.decisionReason,
      }),
  );

export const persistAdminRuntimeConfigProposalsFromEnvironment = (
  environment: unknown,
  input: PersistRuntimeConfigProposalsRequest,
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ service, requestContext }) =>
      service.persistRuntimeConfigProposals({
        requestContext,
        moduleId: input.moduleId,
        renameMap: input.renameMap,
      }),
  );

export const listAdminRuntimeConfigProposalsFromEnvironment = (
  environment: unknown,
  input: AdminGovernanceReadBySessionRequest,
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ service, requestContext }) =>
      service.listRuntimeConfigProposals({
        requestContext,
        moduleId: input.moduleId,
      }),
  );

export const queryAdminAuditEventsByModuleFromEnvironment = (
  environment: unknown,
  input: AdminGovernanceReadBySessionRequest,
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ service, requestContext }) =>
      service.queryAuditEventsByModule({
        requestContext,
        moduleId: input.moduleId,
      }),
  );

export const queryAdminAuditEventsByTargetFromEnvironment = (
  environment: unknown,
  input: AdminGovernanceQueryAuditEventsByTargetRequest,
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ service, requestContext }) =>
      service.queryAuditEventsByTarget({
        requestContext,
        moduleId: input.moduleId,
        target: input.target,
      }),
  );

export const queryAdminAuditEventsByActorFromEnvironment = (
  environment: unknown,
  input: AdminGovernanceQueryAuditEventsByActorRequest,
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ service, requestContext }) =>
      service.queryAuditEventsByActor({
        requestContext,
        actorId: input.actorId,
      }),
  );

export const queryAdminAuditEventsByTenantFromEnvironment = (
  environment: unknown,
  input: AdminGovernanceQueryAuditEventsByTenantRequest,
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ service, requestContext }) =>
      service.queryAuditEventsByTenant({
        requestContext,
        tenantScope: input.tenantScope,
        tenantScopeId: input.tenantScopeId,
      }),
  );

export const exportAdminAuditEventsFromEnvironment = (
  environment: unknown,
  input: AdminGovernanceExportAuditEventsRequest,
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ service, requestContext }) =>
      service.exportAuditEvents({
        requestContext,
        filter: input.filter,
      }),
  );

type ListAdminRuntimeConfigOverrides = (
  input: AdminGovernanceReadBySessionRequest,
) => ReturnType<typeof listAdminRuntimeConfigOverridesFromEnvironment>;

type ListAdminFeatureFlags = (
  input: AdminGovernanceReadBySessionRequest,
) => ReturnType<typeof listAdminFeatureFlagsFromEnvironment>;

type InspectAdminAuthorization = (
  input: AdminGovernanceInspectAuthorizationRequest,
) => ReturnType<typeof inspectAdminAuthorizationFromEnvironment>;

type WriteAdminAuthorizationTuple = (
  input: AdminGovernanceWriteAuthorizationTupleRequest,
) => ReturnType<typeof writeAdminAuthorizationTupleFromEnvironment>;

type SubmitAdminRuntimeConfigOverrideProposal = (
  input: SubmitRuntimeConfigOverrideProposalRequest,
) => ReturnType<typeof submitAdminRuntimeConfigOverrideProposalFromEnvironment>;

type ReviewAdminRuntimeConfigProposal = (
  input: ReviewRuntimeConfigProposalRequest,
) => ReturnType<typeof reviewAdminRuntimeConfigProposalFromEnvironment>;

type PersistAdminRuntimeConfigProposals = (
  input: PersistRuntimeConfigProposalsRequest,
) => ReturnType<typeof persistAdminRuntimeConfigProposalsFromEnvironment>;

type ListAdminRuntimeConfigProposals = (
  input: AdminGovernanceReadBySessionRequest,
) => ReturnType<typeof listAdminRuntimeConfigProposalsFromEnvironment>;

type QueryAdminAuditEventsByModule = (
  input: AdminGovernanceReadBySessionRequest,
) => ReturnType<typeof queryAdminAuditEventsByModuleFromEnvironment>;

type QueryAdminAuditEventsByTarget = (
  input: AdminGovernanceQueryAuditEventsByTargetRequest,
) => ReturnType<typeof queryAdminAuditEventsByTargetFromEnvironment>;

type QueryAdminAuditEventsByActor = (
  input: AdminGovernanceQueryAuditEventsByActorRequest,
) => ReturnType<typeof queryAdminAuditEventsByActorFromEnvironment>;

type QueryAdminAuditEventsByTenant = (
  input: AdminGovernanceQueryAuditEventsByTenantRequest,
) => ReturnType<typeof queryAdminAuditEventsByTenantFromEnvironment>;

type ExportAdminAuditEvents = (
  input: AdminGovernanceExportAuditEventsRequest,
) => ReturnType<typeof exportAdminAuditEventsFromEnvironment>;

export const listAdminRuntimeConfigOverridesFromSessionId = (
  environment: unknown,
  input: AdminGovernanceReadBySessionRequest,
  listAdminRuntimeConfigOverrides: ListAdminRuntimeConfigOverrides = (
    requestInput,
  ) =>
    listAdminRuntimeConfigOverridesFromEnvironment(environment, requestInput),
) => listAdminRuntimeConfigOverrides(input);

export const listAdminFeatureFlagsFromSessionId = (
  environment: unknown,
  input: AdminGovernanceReadBySessionRequest,
  listAdminFeatureFlags: ListAdminFeatureFlags = (requestInput) =>
    listAdminFeatureFlagsFromEnvironment(environment, requestInput),
) => listAdminFeatureFlags(input);

export const inspectAdminAuthorizationFromSessionId = (
  environment: unknown,
  input: AdminGovernanceInspectAuthorizationRequest,
  inspectAdminAuthorization: InspectAdminAuthorization = (requestInput) =>
    inspectAdminAuthorizationFromEnvironment(environment, requestInput),
) => inspectAdminAuthorization(input);

export const writeAdminAuthorizationTupleFromSessionId = (
  environment: unknown,
  input: AdminGovernanceWriteAuthorizationTupleRequest,
  writeAdminAuthorizationTuple: WriteAdminAuthorizationTuple = (requestInput) =>
    writeAdminAuthorizationTupleFromEnvironment(environment, requestInput),
) => writeAdminAuthorizationTuple(input);

export const submitAdminRuntimeConfigOverrideProposalFromSessionId = (
  environment: unknown,
  input: SubmitRuntimeConfigOverrideProposalRequest,
  submitAdminRuntimeConfigOverrideProposal: SubmitAdminRuntimeConfigOverrideProposal = (
    requestInput,
  ) =>
    submitAdminRuntimeConfigOverrideProposalFromEnvironment(
      environment,
      requestInput,
    ),
) => submitAdminRuntimeConfigOverrideProposal(input);

export const reviewAdminRuntimeConfigProposalFromSessionId = (
  environment: unknown,
  input: ReviewRuntimeConfigProposalRequest,
  reviewAdminRuntimeConfigProposal: ReviewAdminRuntimeConfigProposal = (
    requestInput,
  ) =>
    reviewAdminRuntimeConfigProposalFromEnvironment(environment, requestInput),
) => reviewAdminRuntimeConfigProposal(input);

export const persistAdminRuntimeConfigProposalsFromSessionId = (
  environment: unknown,
  input: PersistRuntimeConfigProposalsRequest,
  persistAdminRuntimeConfigProposals: PersistAdminRuntimeConfigProposals = (
    requestInput,
  ) =>
    persistAdminRuntimeConfigProposalsFromEnvironment(
      environment,
      requestInput,
    ),
) => persistAdminRuntimeConfigProposals(input);

export const listAdminRuntimeConfigProposalsFromSessionId = (
  environment: unknown,
  input: AdminGovernanceReadBySessionRequest,
  listAdminRuntimeConfigProposals: ListAdminRuntimeConfigProposals = (
    requestInput,
  ) =>
    listAdminRuntimeConfigProposalsFromEnvironment(environment, requestInput),
) => listAdminRuntimeConfigProposals(input);

export const queryAdminAuditEventsByModuleFromSessionId = (
  environment: unknown,
  input: AdminGovernanceReadBySessionRequest,
  queryAdminAuditEventsByModule: QueryAdminAuditEventsByModule = (
    requestInput,
  ) => queryAdminAuditEventsByModuleFromEnvironment(environment, requestInput),
) => queryAdminAuditEventsByModule(input);

export const queryAdminAuditEventsByTargetFromSessionId = (
  environment: unknown,
  input: AdminGovernanceQueryAuditEventsByTargetRequest,
  queryAdminAuditEventsByTarget: QueryAdminAuditEventsByTarget = (
    requestInput,
  ) => queryAdminAuditEventsByTargetFromEnvironment(environment, requestInput),
) => queryAdminAuditEventsByTarget(input);

export const queryAdminAuditEventsByActorFromSessionId = (
  environment: unknown,
  input: AdminGovernanceQueryAuditEventsByActorRequest,
  queryAdminAuditEventsByActor: QueryAdminAuditEventsByActor = (requestInput) =>
    queryAdminAuditEventsByActorFromEnvironment(environment, requestInput),
) => queryAdminAuditEventsByActor(input);

export const queryAdminAuditEventsByTenantFromSessionId = (
  environment: unknown,
  input: AdminGovernanceQueryAuditEventsByTenantRequest,
  queryAdminAuditEventsByTenant: QueryAdminAuditEventsByTenant = (
    requestInput,
  ) => queryAdminAuditEventsByTenantFromEnvironment(environment, requestInput),
) => queryAdminAuditEventsByTenant(input);

export const exportAdminAuditEventsFromSessionId = (
  environment: unknown,
  input: AdminGovernanceExportAuditEventsRequest,
  exportAdminAuditEvents: ExportAdminAuditEvents = (requestInput) =>
    exportAdminAuditEventsFromEnvironment(environment, requestInput),
) => exportAdminAuditEvents(input);
