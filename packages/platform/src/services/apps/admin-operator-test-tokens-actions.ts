/**
 * Root-safe app helpers for the admin-operator-test-tokens platform
 * service (admin-app implementation plan §9 item 17 — Phase
 * 7a-2b-iii).
 *
 * Mirrors the `admin-organization-actions.ts` and
 * `admin-saved-views-actions.ts` patterns: helpers stay free of any
 * `Request` / `Response` shaping, never own a duplicate
 * `Effect.tryPromise`, and load the env-bound service runtime
 * through `loadRuntimeModuleOrDie` so the import graph remains
 * safe to evaluate at app root scope (the live runtime pulls in
 * Postgres + the admin-organization repository for the admin-owner
 * floor and would otherwise eagerly resolve env values at module
 * load time).
 *
 * The `*FromSessionId` helpers exposed below build the trusted
 * RequestContext through the shared admin-app session bridge so
 * loaders receive only an opaque session id. They are deliberately
 * separate from the lower-level `*FromEnvironment` helpers used by
 * the test harness.
 */
import { Effect } from "effect";
import {
  resolveTrustedRequestContextFromSessionId,
  type ResolveTrustedRequestContextError,
} from "../access/trusted-request-context";
import type {
  AdminOperatorTestTokenIssueInput,
  AdminOperatorTestTokenListInput,
  AdminOperatorTestTokenRevokeInput,
} from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

const loadAdminOperatorTestTokensRuntime = () =>
  loadRuntimeModuleOrDie(
    () => import("../access/admin-operator-test-tokens-service"),
  );

export const listAdminOperatorTestTokensFromEnvironment = (
  environment: unknown,
  input: AdminOperatorTestTokenListInput,
) =>
  loadAdminOperatorTestTokensRuntime().pipe(
    Effect.flatMap(({ runAdminOperatorTestTokensFromEnvironment }) =>
      runAdminOperatorTestTokensFromEnvironment(environment, (service) =>
        service.list(input),
      ),
    ),
  );

export const issueAdminOperatorTestTokenFromEnvironment = (
  environment: unknown,
  input: AdminOperatorTestTokenIssueInput,
) =>
  loadAdminOperatorTestTokensRuntime().pipe(
    Effect.flatMap(({ runAdminOperatorTestTokensFromEnvironment }) =>
      runAdminOperatorTestTokensFromEnvironment(environment, (service) =>
        service.issueToken(input),
      ),
    ),
  );

export const revokeAdminOperatorTestTokenFromEnvironment = (
  environment: unknown,
  input: AdminOperatorTestTokenRevokeInput,
) =>
  loadAdminOperatorTestTokensRuntime().pipe(
    Effect.flatMap(({ runAdminOperatorTestTokensFromEnvironment }) =>
      runAdminOperatorTestTokensFromEnvironment(environment, (service) =>
        service.revokeToken(input),
      ),
    ),
  );

/**
 * Session-keyed wrappers used by the admin-app loaders. Each one
 * resolves the trusted RequestContext via the shared
 * `trusted-request-context` helper, then delegates to the matching
 * `*FromEnvironment` helper above. Loader / action tests can swap
 * the `resolveRequestContext` argument for an in-memory fake to
 * pin behavior without spinning the full runtime.
 */
export interface ListAdminOperatorTestTokensFromSessionIdInput {
  readonly sessionId: string;
  readonly status?: AdminOperatorTestTokenListInput["status"];
  readonly pageSize?: AdminOperatorTestTokenListInput["pageSize"];
  readonly pageToken?: AdminOperatorTestTokenListInput["pageToken"];
}

export const listAdminOperatorTestTokensFromSessionId = (
  environment: unknown,
  input: ListAdminOperatorTestTokensFromSessionIdInput,
  resolveRequestContext: (
    environment: unknown,
    sessionId: string,
  ) => Effect.Effect<
    Parameters<
      typeof listAdminOperatorTestTokensFromEnvironment
    >[1]["requestContext"],
    ResolveTrustedRequestContextError
  > = resolveTrustedRequestContextFromSessionId,
) =>
  resolveRequestContext(environment, input.sessionId).pipe(
    Effect.flatMap((requestContext) =>
      listAdminOperatorTestTokensFromEnvironment(environment, {
        requestContext,
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.pageSize === undefined ? {} : { pageSize: input.pageSize }),
        ...(input.pageToken === undefined
          ? {}
          : { pageToken: input.pageToken }),
      }),
    ),
  );

export interface IssueAdminOperatorTestTokenFromSessionIdInput {
  readonly sessionId: string;
  readonly label: AdminOperatorTestTokenIssueInput["label"];
  readonly expiresAt: AdminOperatorTestTokenIssueInput["expiresAt"];
  readonly reasonCatalogId: AdminOperatorTestTokenIssueInput["reasonCatalogId"];
  readonly reasonAttachmentText: AdminOperatorTestTokenIssueInput["reasonAttachmentText"];
}

export const issueAdminOperatorTestTokenFromSessionId = (
  environment: unknown,
  input: IssueAdminOperatorTestTokenFromSessionIdInput,
  resolveRequestContext: (
    environment: unknown,
    sessionId: string,
  ) => Effect.Effect<
    Parameters<
      typeof issueAdminOperatorTestTokenFromEnvironment
    >[1]["requestContext"],
    ResolveTrustedRequestContextError
  > = resolveTrustedRequestContextFromSessionId,
) =>
  resolveRequestContext(environment, input.sessionId).pipe(
    Effect.flatMap((requestContext) =>
      issueAdminOperatorTestTokenFromEnvironment(environment, {
        requestContext,
        label: input.label,
        expiresAt: input.expiresAt,
        reasonCatalogId: input.reasonCatalogId,
        reasonAttachmentText: input.reasonAttachmentText,
      }),
    ),
  );

export interface RevokeAdminOperatorTestTokenFromSessionIdInput {
  readonly sessionId: string;
  readonly id: AdminOperatorTestTokenRevokeInput["id"];
  readonly reasonCatalogId: AdminOperatorTestTokenRevokeInput["reasonCatalogId"];
}

export const revokeAdminOperatorTestTokenFromSessionId = (
  environment: unknown,
  input: RevokeAdminOperatorTestTokenFromSessionIdInput,
  resolveRequestContext: (
    environment: unknown,
    sessionId: string,
  ) => Effect.Effect<
    Parameters<
      typeof revokeAdminOperatorTestTokenFromEnvironment
    >[1]["requestContext"],
    ResolveTrustedRequestContextError
  > = resolveTrustedRequestContextFromSessionId,
) =>
  resolveRequestContext(environment, input.sessionId).pipe(
    Effect.flatMap((requestContext) =>
      revokeAdminOperatorTestTokenFromEnvironment(environment, {
        requestContext,
        id: input.id,
        reasonCatalogId: input.reasonCatalogId,
      }),
    ),
  );
