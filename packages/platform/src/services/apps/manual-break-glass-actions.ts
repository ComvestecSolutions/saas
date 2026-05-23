import { Effect } from "effect";
import type { ManualBreakGlassGrant } from "@comvestec/contracts";
import type {
  CurrentContextInput,
  IssueManualBreakGlassInput,
  ListActiveGrantsInput,
  ReleaseManualBreakGlassInput,
} from "../access/manual-break-glass-service";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the manual break-glass platform service.
 *
 * Mirrors the `admin-organization-actions.ts` pattern: the helpers
 * stay free of any `Request` / `Response` shaping, never own a
 * duplicate `Effect.tryPromise`, and load the env-bound service
 * runtime through `loadRuntimeModuleOrDie` so the import graph
 * remains safe to evaluate at app root scope (admin-app
 * implementation plan §9 item 5 follow-up).
 */
const loadManualBreakGlassRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../access/manual-break-glass-service"));

export const issueBreakGlassGrantFromEnvironment = (
  environment: unknown,
  input: IssueManualBreakGlassInput,
) =>
  loadManualBreakGlassRuntime().pipe(
    Effect.flatMap(({ runManualBreakGlassFromEnvironment }) =>
      runManualBreakGlassFromEnvironment(environment, (service) =>
        service.issueGrant(input),
      ),
    ),
  );

export const releaseBreakGlassGrantFromEnvironment = (
  environment: unknown,
  input: ReleaseManualBreakGlassInput,
) =>
  loadManualBreakGlassRuntime().pipe(
    Effect.flatMap(({ runManualBreakGlassFromEnvironment }) =>
      runManualBreakGlassFromEnvironment(environment, (service) =>
        service.releaseGrant(input),
      ),
    ),
  );

export const listActiveBreakGlassGrantsForSubjectFromEnvironment = (
  environment: unknown,
  input: ListActiveGrantsInput,
) =>
  loadManualBreakGlassRuntime().pipe(
    Effect.flatMap(({ runManualBreakGlassFromEnvironment }) =>
      runManualBreakGlassFromEnvironment(environment, (service) =>
        service.listActiveGrantsForSubject(input),
      ),
    ),
  );

export const currentBreakGlassContextForActorFromEnvironment = (
  environment: unknown,
  input: CurrentContextInput,
) =>
  loadManualBreakGlassRuntime().pipe(
    Effect.flatMap(({ runManualBreakGlassFromEnvironment }) =>
      runManualBreakGlassFromEnvironment(environment, (service) =>
        service.currentBreakGlassContextForActor(input),
      ),
    ),
  );

export type { ManualBreakGlassGrant };
