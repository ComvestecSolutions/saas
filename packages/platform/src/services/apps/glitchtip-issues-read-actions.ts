import { Effect } from "effect";
import type {
  GlitchTipIssue,
  GlitchTipIssueGetByIdInput,
  GlitchTipIssueList,
  GlitchTipIssueListByLevelInput,
  GlitchTipIssueListByProjectInput,
  RequestContext,
} from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the GlitchTip issues read platform
 * service (admin-app implementation plan §9 item 10 — batch B
 * vendor #3).
 *
 * Mirrors the postal-mail-log-read-actions.ts /
 * novu-deliveries-read-actions.ts / open-meter-meter-read-actions.ts /
 * keycloak-user-read-actions.ts / polar-customer-read-actions.ts
 * pattern: helpers stay free of any `Request` / `Response` shaping,
 * never own a duplicate `Effect.tryPromise`, and load the env-bound
 * service runtime through the single `loadRuntimeModuleOrDie` seam
 * so the import graph remains safe to evaluate at app root scope.
 */
const loadGlitchTipIssuesReadRuntime = () =>
  loadRuntimeModuleOrDie(
    () => import("../domains/glitchtip-issues-read-service"),
  );

export const getGlitchTipIssueByIdFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: GlitchTipIssueGetByIdInput;
  },
) =>
  loadGlitchTipIssuesReadRuntime().pipe(
    Effect.flatMap(({ runGlitchTipIssuesReadFromEnvironment }) =>
      runGlitchTipIssuesReadFromEnvironment(environment, (service) =>
        service.getById(input),
      ),
    ),
  );

export const listGlitchTipIssuesByProjectFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: GlitchTipIssueListByProjectInput;
  },
) =>
  loadGlitchTipIssuesReadRuntime().pipe(
    Effect.flatMap(({ runGlitchTipIssuesReadFromEnvironment }) =>
      runGlitchTipIssuesReadFromEnvironment(environment, (service) =>
        service.listByProject(input),
      ),
    ),
  );

export const listGlitchTipIssuesByLevelFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: GlitchTipIssueListByLevelInput;
  },
) =>
  loadGlitchTipIssuesReadRuntime().pipe(
    Effect.flatMap(({ runGlitchTipIssuesReadFromEnvironment }) =>
      runGlitchTipIssuesReadFromEnvironment(environment, (service) =>
        service.listByLevel(input),
      ),
    ),
  );

export type {
  GlitchTipIssue,
  GlitchTipIssueGetByIdInput,
  GlitchTipIssueList,
  GlitchTipIssueListByLevelInput,
  GlitchTipIssueListByProjectInput,
};
