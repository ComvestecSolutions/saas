import { Effect } from "effect";
import type {
  AdminTenantDirectoryQueryBySessionRequest,
  AdminTenantInvitationIssueBySessionRequest,
  AdminTenantInvitationQueryBySessionRequest,
  AdminTenantInvitationRevokeBySessionRequest,
  AdminTenantMembershipMutationBySessionRequest,
  AdminTenantMembershipQueryBySessionRequest,
  AdminTenantOnboardingReviewBySessionRequest,
} from "../domains/admin-tenant-management";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

const loadAdminTenantManagementRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../domains/admin-tenant-management"));

export const reviewTenantOnboardingFromEnvironment = (
  environment: unknown,
  input: AdminTenantOnboardingReviewBySessionRequest,
) =>
  loadAdminTenantManagementRuntime().pipe(
    Effect.flatMap(({ runAdminTenantManagementFromEnvironment }) =>
      runAdminTenantManagementFromEnvironment(environment, (service) =>
        service.reviewTenantOnboarding(input),
      ),
    ),
  );

export const listTenantDirectoryFromEnvironment = (
  environment: unknown,
  input: AdminTenantDirectoryQueryBySessionRequest,
) =>
  loadAdminTenantManagementRuntime().pipe(
    Effect.flatMap(({ runAdminTenantManagementFromEnvironment }) =>
      runAdminTenantManagementFromEnvironment(environment, (service) =>
        service.listTenantDirectory(input),
      ),
    ),
  );

export const listTenantMembershipsFromEnvironment = (
  environment: unknown,
  input: AdminTenantMembershipQueryBySessionRequest,
) =>
  loadAdminTenantManagementRuntime().pipe(
    Effect.flatMap(({ runAdminTenantManagementFromEnvironment }) =>
      runAdminTenantManagementFromEnvironment(environment, (service) =>
        service.listTenantMemberships(input),
      ),
    ),
  );

export const mutateTenantMembershipFromEnvironment = (
  environment: unknown,
  input: AdminTenantMembershipMutationBySessionRequest,
) =>
  loadAdminTenantManagementRuntime().pipe(
    Effect.flatMap(({ runAdminTenantManagementFromEnvironment }) =>
      runAdminTenantManagementFromEnvironment(environment, (service) =>
        service.mutateTenantMembership(input),
      ),
    ),
  );

export const issueTenantInvitationFromEnvironment = (
  environment: unknown,
  input: AdminTenantInvitationIssueBySessionRequest,
) =>
  loadAdminTenantManagementRuntime().pipe(
    Effect.flatMap(({ runAdminTenantManagementFromEnvironment }) =>
      runAdminTenantManagementFromEnvironment(environment, (service) =>
        service.issueTenantInvitation(input),
      ),
    ),
  );

export const listTenantInvitationsFromEnvironment = (
  environment: unknown,
  input: AdminTenantInvitationQueryBySessionRequest,
) =>
  loadAdminTenantManagementRuntime().pipe(
    Effect.flatMap(({ runAdminTenantManagementFromEnvironment }) =>
      runAdminTenantManagementFromEnvironment(environment, (service) =>
        service.listTenantInvitations(input),
      ),
    ),
  );

export const revokeTenantInvitationFromEnvironment = (
  environment: unknown,
  input: AdminTenantInvitationRevokeBySessionRequest,
) =>
  loadAdminTenantManagementRuntime().pipe(
    Effect.flatMap(({ runAdminTenantManagementFromEnvironment }) =>
      runAdminTenantManagementFromEnvironment(environment, (service) =>
        service.revokeTenantInvitation(input),
      ),
    ),
  );

type ReviewTenantOnboarding = (
  input: AdminTenantOnboardingReviewBySessionRequest,
) => ReturnType<typeof reviewTenantOnboardingFromEnvironment>;

type ListTenantDirectory = (
  input: AdminTenantDirectoryQueryBySessionRequest,
) => ReturnType<typeof listTenantDirectoryFromEnvironment>;

type ListTenantMemberships = (
  input: AdminTenantMembershipQueryBySessionRequest,
) => ReturnType<typeof listTenantMembershipsFromEnvironment>;

type MutateTenantMembership = (
  input: AdminTenantMembershipMutationBySessionRequest,
) => ReturnType<typeof mutateTenantMembershipFromEnvironment>;

type IssueTenantInvitation = (
  input: AdminTenantInvitationIssueBySessionRequest,
) => ReturnType<typeof issueTenantInvitationFromEnvironment>;

type ListTenantInvitations = (
  input: AdminTenantInvitationQueryBySessionRequest,
) => ReturnType<typeof listTenantInvitationsFromEnvironment>;

type RevokeTenantInvitation = (
  input: AdminTenantInvitationRevokeBySessionRequest,
) => ReturnType<typeof revokeTenantInvitationFromEnvironment>;

export const reviewTenantOnboardingFromSessionId = (
  environment: unknown,
  input: AdminTenantOnboardingReviewBySessionRequest,
  reviewTenantOnboarding: ReviewTenantOnboarding = (requestInput) =>
    reviewTenantOnboardingFromEnvironment(environment, requestInput),
) => reviewTenantOnboarding(input);

export const listTenantDirectoryFromSessionId = (
  environment: unknown,
  input: AdminTenantDirectoryQueryBySessionRequest,
  listTenantDirectory: ListTenantDirectory = (requestInput) =>
    listTenantDirectoryFromEnvironment(environment, requestInput),
) => listTenantDirectory(input);

export const listTenantMembershipsFromSessionId = (
  environment: unknown,
  input: AdminTenantMembershipQueryBySessionRequest,
  listTenantMemberships: ListTenantMemberships = (requestInput) =>
    listTenantMembershipsFromEnvironment(environment, requestInput),
) => listTenantMemberships(input);

export const mutateTenantMembershipFromSessionId = (
  environment: unknown,
  input: AdminTenantMembershipMutationBySessionRequest,
  mutateTenantMembership: MutateTenantMembership = (requestInput) =>
    mutateTenantMembershipFromEnvironment(environment, requestInput),
) => mutateTenantMembership(input);

export const issueTenantInvitationFromSessionId = (
  environment: unknown,
  input: AdminTenantInvitationIssueBySessionRequest,
  issueTenantInvitation: IssueTenantInvitation = (requestInput) =>
    issueTenantInvitationFromEnvironment(environment, requestInput),
) => issueTenantInvitation(input);

export const listTenantInvitationsFromSessionId = (
  environment: unknown,
  input: AdminTenantInvitationQueryBySessionRequest,
  listTenantInvitations: ListTenantInvitations = (requestInput) =>
    listTenantInvitationsFromEnvironment(environment, requestInput),
) => listTenantInvitations(input);

export const revokeTenantInvitationFromSessionId = (
  environment: unknown,
  input: AdminTenantInvitationRevokeBySessionRequest,
  revokeTenantInvitation: RevokeTenantInvitation = (requestInput) =>
    revokeTenantInvitationFromEnvironment(environment, requestInput),
) => revokeTenantInvitation(input);
