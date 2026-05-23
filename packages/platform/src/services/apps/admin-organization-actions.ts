import { Effect } from "effect";
import {
  platformModuleId,
  type AdminMember,
  type AdminMemberInvitation,
  type ResolvedAdminCapabilities,
} from "@comvestec/contracts";
import type {
  ChangeMemberRoleInput,
  InviteMemberInput,
  InviteMemberResult,
  ListMembersInput,
  RedeemInvitationInput,
  RemoveMemberInput,
  ResolveCapabilitiesInput,
} from "../access/admin-organization-service";
import type { AdminGovernanceReadBySessionRequest } from "../governance/admin-governance";
import { loadRuntimeModuleOrDie } from "./runtime-loader";
import { queryAdminAuditEventsByModuleFromEnvironment } from "./admin-governance-actions";

/**
 * Root-safe app helpers for the admin-organization platform service.
 *
 * Mirrors the `admin-operator-management-actions.ts` pattern: the
 * helpers stay free of any `Request` / `Response` shaping, never
 * own a duplicate `Effect.tryPromise`, and load the env-bound
 * service runtime through `loadRuntimeModuleOrDie` so the import
 * graph remains safe to evaluate at app root scope.
 */
const loadAdminOrganizationRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../access/admin-organization-service"));

export const listMembersFromEnvironment = (
  environment: unknown,
  input: ListMembersInput,
) =>
  loadAdminOrganizationRuntime().pipe(
    Effect.flatMap(({ runAdminOrganizationFromEnvironment }) =>
      runAdminOrganizationFromEnvironment(environment, (service) =>
        service.listMembers(input),
      ),
    ),
  );

/**
 * Canonical alias of `listMembersFromEnvironment` for admin-app
 * consumers. The admin-app loader trios call admin-organization
 * helpers under the `listAdminOrganization*FromEnvironment` naming
 * convention shared with the other admin-org helpers; this alias
 * keeps both names live without duplicating implementation.
 */
export const listAdminOrganizationMembersFromEnvironment =
  listMembersFromEnvironment;

/**
 * Admin-organization-scoped audit feed for the admin-app
 * `/admin/audit` surface. Wraps the existing module-scoped audit
 * plumbing in `queryAdminAuditEventsByModuleFromEnvironment` and
 * pins `moduleId` to `platformModuleId.adminOrganization` so the
 * caller only supplies the operator `sessionId`. Returns the same
 * `AuditEvent[]` shape as the underlying helper, preserving the
 * typed `AdminGovernanceServiceError` channel.
 */
export interface QueryAdminOrganizationScopedAuditEventsInput {
  readonly sessionId: string;
}

export const queryAdminOrganizationScopedAuditEventsFromEnvironment = (
  environment: unknown,
  input: QueryAdminOrganizationScopedAuditEventsInput,
) =>
  queryAdminAuditEventsByModuleFromEnvironment(environment, {
    sessionId: input.sessionId,
    moduleId: platformModuleId.adminOrganization,
  });

type QueryAdminOrganizationScopedAuditEventsByModule = (
  input: AdminGovernanceReadBySessionRequest,
) => ReturnType<typeof queryAdminAuditEventsByModuleFromEnvironment>;

/**
 * `*FromSessionId` seam mirroring the admin-governance helper
 * pattern. Exposes an injectable delegate (default: the live env
 * helper) so loader and action tests can assert that the underlying
 * audit query is pinned to `platformModuleId.adminOrganization`
 * without spinning the full runtime.
 */
export const queryAdminOrganizationScopedAuditEventsFromSessionId = (
  environment: unknown,
  input: QueryAdminOrganizationScopedAuditEventsInput,
  queryAuditEventsByModule: QueryAdminOrganizationScopedAuditEventsByModule = (
    requestInput,
  ) => queryAdminAuditEventsByModuleFromEnvironment(environment, requestInput),
) =>
  queryAuditEventsByModule({
    sessionId: input.sessionId,
    moduleId: platformModuleId.adminOrganization,
  });

export const inviteMemberFromEnvironment = (
  environment: unknown,
  input: InviteMemberInput,
) =>
  loadAdminOrganizationRuntime().pipe(
    Effect.flatMap(({ runAdminOrganizationFromEnvironment }) =>
      runAdminOrganizationFromEnvironment(environment, (service) =>
        service.inviteMember(input),
      ),
    ),
  );

export const redeemInvitationFromEnvironment = (
  environment: unknown,
  input: RedeemInvitationInput,
) =>
  loadAdminOrganizationRuntime().pipe(
    Effect.flatMap(({ runAdminOrganizationFromEnvironment }) =>
      runAdminOrganizationFromEnvironment(environment, (service) =>
        service.redeemInvitation(input),
      ),
    ),
  );

export const changeMemberRoleFromEnvironment = (
  environment: unknown,
  input: ChangeMemberRoleInput,
) =>
  loadAdminOrganizationRuntime().pipe(
    Effect.flatMap(({ runAdminOrganizationFromEnvironment }) =>
      runAdminOrganizationFromEnvironment(environment, (service) =>
        service.changeMemberRole(input),
      ),
    ),
  );

export const removeMemberFromEnvironment = (
  environment: unknown,
  input: RemoveMemberInput,
) =>
  loadAdminOrganizationRuntime().pipe(
    Effect.flatMap(({ runAdminOrganizationFromEnvironment }) =>
      runAdminOrganizationFromEnvironment(environment, (service) =>
        service.removeMember(input),
      ),
    ),
  );

export const resolveCapabilitiesForFromEnvironment = (
  environment: unknown,
  input: ResolveCapabilitiesInput,
) =>
  loadAdminOrganizationRuntime().pipe(
    Effect.flatMap(({ runAdminOrganizationFromEnvironment }) =>
      runAdminOrganizationFromEnvironment(environment, (service) =>
        service.resolveCapabilitiesFor(input),
      ),
    ),
  );

export type {
  AdminMember,
  AdminMemberInvitation,
  InviteMemberResult,
  ResolvedAdminCapabilities,
};
