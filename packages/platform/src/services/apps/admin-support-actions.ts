import { Effect } from "effect";
import type {
  SupportOperationsGetBreakGlassIncidentRequest,
  SupportOperationsGetTenantHealthRequest,
  SupportOperationsGrantBreakGlassRequest,
  SupportOperationsListBreakGlassIncidentsRequest,
  SupportOperationsListCasesRequest,
  SupportOperationsListImpersonationSessionsRequest,
  SupportOperationsReviewBreakGlassIncidentRequest,
  SupportOperationsRevokeImpersonationSessionRequest,
  SupportOperationsStartImpersonationRequest,
  SupportOperationsUpsertCaseRequest,
} from "../governance/support-operations";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

const loadSupportOperationsRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../governance/support-operations"));

export const startSupportImpersonationFromEnvironment = (
  environment: unknown,
  input: SupportOperationsStartImpersonationRequest,
) =>
  loadSupportOperationsRuntime().pipe(
    Effect.flatMap(({ runSupportOperationsFromEnvironment }) =>
      runSupportOperationsFromEnvironment(environment, (service) =>
        service.startImpersonation(input),
      ),
    ),
  );

export const upsertSupportCaseFromEnvironment = (
  environment: unknown,
  input: SupportOperationsUpsertCaseRequest,
) =>
  loadSupportOperationsRuntime().pipe(
    Effect.flatMap(({ runSupportOperationsFromEnvironment }) =>
      runSupportOperationsFromEnvironment(environment, (service) =>
        service.upsertCase(input),
      ),
    ),
  );

export const listSupportCasesFromEnvironment = (
  environment: unknown,
  input: SupportOperationsListCasesRequest,
) =>
  loadSupportOperationsRuntime().pipe(
    Effect.flatMap(({ runSupportOperationsFromEnvironment }) =>
      runSupportOperationsFromEnvironment(environment, (service) =>
        service.listCases(input),
      ),
    ),
  );

export const getSupportTenantHealthFromEnvironment = (
  environment: unknown,
  input: SupportOperationsGetTenantHealthRequest,
) =>
  loadSupportOperationsRuntime().pipe(
    Effect.flatMap(({ runSupportOperationsFromEnvironment }) =>
      runSupportOperationsFromEnvironment(environment, (service) =>
        service.getTenantHealth(input),
      ),
    ),
  );

export const grantSupportBreakGlassAccessFromEnvironment = (
  environment: unknown,
  input: SupportOperationsGrantBreakGlassRequest,
) =>
  loadSupportOperationsRuntime().pipe(
    Effect.flatMap(({ runSupportOperationsFromEnvironment }) =>
      runSupportOperationsFromEnvironment(environment, (service) =>
        service.grantBreakGlassAccess(input),
      ),
    ),
  );

export const listSupportImpersonationSessionsFromEnvironment = (
  environment: unknown,
  input: SupportOperationsListImpersonationSessionsRequest,
) =>
  loadSupportOperationsRuntime().pipe(
    Effect.flatMap(({ runSupportOperationsFromEnvironment }) =>
      runSupportOperationsFromEnvironment(environment, (service) =>
        service.listImpersonationSessions(input),
      ),
    ),
  );

export const revokeSupportImpersonationSessionFromEnvironment = (
  environment: unknown,
  input: SupportOperationsRevokeImpersonationSessionRequest,
) =>
  loadSupportOperationsRuntime().pipe(
    Effect.flatMap(({ runSupportOperationsFromEnvironment }) =>
      runSupportOperationsFromEnvironment(environment, (service) =>
        service.revokeImpersonationSession(input),
      ),
    ),
  );

export const listSupportBreakGlassIncidentsFromEnvironment = (
  environment: unknown,
  input: SupportOperationsListBreakGlassIncidentsRequest,
) =>
  loadSupportOperationsRuntime().pipe(
    Effect.flatMap(({ runSupportOperationsFromEnvironment }) =>
      runSupportOperationsFromEnvironment(environment, (service) =>
        service.listBreakGlassIncidents(input),
      ),
    ),
  );

export const getSupportBreakGlassIncidentFromEnvironment = (
  environment: unknown,
  input: SupportOperationsGetBreakGlassIncidentRequest,
) =>
  loadSupportOperationsRuntime().pipe(
    Effect.flatMap(({ runSupportOperationsFromEnvironment }) =>
      runSupportOperationsFromEnvironment(environment, (service) =>
        service.getBreakGlassIncident(input),
      ),
    ),
  );

export const reviewSupportBreakGlassIncidentFromEnvironment = (
  environment: unknown,
  input: SupportOperationsReviewBreakGlassIncidentRequest,
) =>
  loadSupportOperationsRuntime().pipe(
    Effect.flatMap(({ runSupportOperationsFromEnvironment }) =>
      runSupportOperationsFromEnvironment(environment, (service) =>
        service.reviewBreakGlassIncident(input),
      ),
    ),
  );

type StartSupportImpersonation = (
  input: SupportOperationsStartImpersonationRequest,
) => ReturnType<typeof startSupportImpersonationFromEnvironment>;

type UpsertSupportCase = (
  input: SupportOperationsUpsertCaseRequest,
) => ReturnType<typeof upsertSupportCaseFromEnvironment>;

type ListSupportCases = (
  input: SupportOperationsListCasesRequest,
) => ReturnType<typeof listSupportCasesFromEnvironment>;

type GetSupportTenantHealth = (
  input: SupportOperationsGetTenantHealthRequest,
) => ReturnType<typeof getSupportTenantHealthFromEnvironment>;

type GrantSupportBreakGlassAccess = (
  input: SupportOperationsGrantBreakGlassRequest,
) => ReturnType<typeof grantSupportBreakGlassAccessFromEnvironment>;

type ListSupportImpersonationSessions = (
  input: SupportOperationsListImpersonationSessionsRequest,
) => ReturnType<typeof listSupportImpersonationSessionsFromEnvironment>;

type RevokeSupportImpersonationSession = (
  input: SupportOperationsRevokeImpersonationSessionRequest,
) => ReturnType<typeof revokeSupportImpersonationSessionFromEnvironment>;

type ListSupportBreakGlassIncidents = (
  input: SupportOperationsListBreakGlassIncidentsRequest,
) => ReturnType<typeof listSupportBreakGlassIncidentsFromEnvironment>;

type GetSupportBreakGlassIncident = (
  input: SupportOperationsGetBreakGlassIncidentRequest,
) => ReturnType<typeof getSupportBreakGlassIncidentFromEnvironment>;

type ReviewSupportBreakGlassIncident = (
  input: SupportOperationsReviewBreakGlassIncidentRequest,
) => ReturnType<typeof reviewSupportBreakGlassIncidentFromEnvironment>;

export const startSupportImpersonationFromSessionId = (
  environment: unknown,
  input: SupportOperationsStartImpersonationRequest,
  startSupportImpersonation: StartSupportImpersonation = (requestInput) =>
    startSupportImpersonationFromEnvironment(environment, requestInput),
) => startSupportImpersonation(input);

export const upsertSupportCaseFromSessionId = (
  environment: unknown,
  input: SupportOperationsUpsertCaseRequest,
  upsertSupportCase: UpsertSupportCase = (requestInput) =>
    upsertSupportCaseFromEnvironment(environment, requestInput),
) => upsertSupportCase(input);

export const listSupportCasesFromSessionId = (
  environment: unknown,
  input: SupportOperationsListCasesRequest,
  listSupportCases: ListSupportCases = (requestInput) =>
    listSupportCasesFromEnvironment(environment, requestInput),
) => listSupportCases(input);

export const getSupportTenantHealthFromSessionId = (
  environment: unknown,
  input: SupportOperationsGetTenantHealthRequest,
  getSupportTenantHealth: GetSupportTenantHealth = (requestInput) =>
    getSupportTenantHealthFromEnvironment(environment, requestInput),
) => getSupportTenantHealth(input);

export const grantSupportBreakGlassAccessFromSessionId = (
  environment: unknown,
  input: SupportOperationsGrantBreakGlassRequest,
  grantSupportBreakGlassAccess: GrantSupportBreakGlassAccess = (requestInput) =>
    grantSupportBreakGlassAccessFromEnvironment(environment, requestInput),
) => grantSupportBreakGlassAccess(input);

export const listSupportImpersonationSessionsFromSessionId = (
  environment: unknown,
  input: SupportOperationsListImpersonationSessionsRequest,
  listSupportImpersonationSessions: ListSupportImpersonationSessions = (
    requestInput,
  ) =>
    listSupportImpersonationSessionsFromEnvironment(environment, requestInput),
) => listSupportImpersonationSessions(input);

export const revokeSupportImpersonationSessionFromSessionId = (
  environment: unknown,
  input: SupportOperationsRevokeImpersonationSessionRequest,
  revokeSupportImpersonationSession: RevokeSupportImpersonationSession = (
    requestInput,
  ) =>
    revokeSupportImpersonationSessionFromEnvironment(environment, requestInput),
) => revokeSupportImpersonationSession(input);

export const listSupportBreakGlassIncidentsFromSessionId = (
  environment: unknown,
  input: SupportOperationsListBreakGlassIncidentsRequest,
  listSupportBreakGlassIncidents: ListSupportBreakGlassIncidents = (
    requestInput,
  ) => listSupportBreakGlassIncidentsFromEnvironment(environment, requestInput),
) => listSupportBreakGlassIncidents(input);

export const getSupportBreakGlassIncidentFromSessionId = (
  environment: unknown,
  input: SupportOperationsGetBreakGlassIncidentRequest,
  getSupportBreakGlassIncident: GetSupportBreakGlassIncident = (requestInput) =>
    getSupportBreakGlassIncidentFromEnvironment(environment, requestInput),
) => getSupportBreakGlassIncident(input);

export const reviewSupportBreakGlassIncidentFromSessionId = (
  environment: unknown,
  input: SupportOperationsReviewBreakGlassIncidentRequest,
  reviewSupportBreakGlassIncident: ReviewSupportBreakGlassIncident = (
    requestInput,
  ) =>
    reviewSupportBreakGlassIncidentFromEnvironment(environment, requestInput),
) => reviewSupportBreakGlassIncident(input);
