import { Effect } from "effect";
import type { AdminSavedView } from "@comvestec/contracts";
import type {
  CreateSavedViewInput,
  DeleteSavedViewInput,
  GetSavedViewInput,
  ListSavedViewsInput,
  SetPinnedSavedViewInput,
  UpdateSavedViewInput,
} from "../access/admin-saved-views-service";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the admin-saved-views platform service.
 *
 * Mirrors the `admin-organization-actions.ts` pattern: helpers stay
 * free of any `Request`/`Response` shaping, never own a duplicate
 * `Effect.tryPromise`, and load the env-bound service runtime
 * through `loadRuntimeModuleOrDie` so the import graph remains safe
 * to evaluate at app root scope.
 */
const loadAdminSavedViewsRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../access/admin-saved-views-service"));

export const listSavedViewsFromEnvironment = (
  environment: unknown,
  input: ListSavedViewsInput,
) =>
  loadAdminSavedViewsRuntime().pipe(
    Effect.flatMap(({ runAdminSavedViewsFromEnvironment }) =>
      runAdminSavedViewsFromEnvironment(environment, (service) =>
        service.list(input),
      ),
    ),
  );

export const getSavedViewFromEnvironment = (
  environment: unknown,
  input: GetSavedViewInput,
) =>
  loadAdminSavedViewsRuntime().pipe(
    Effect.flatMap(({ runAdminSavedViewsFromEnvironment }) =>
      runAdminSavedViewsFromEnvironment(environment, (service) =>
        service.get(input),
      ),
    ),
  );

export const createSavedViewFromEnvironment = (
  environment: unknown,
  input: CreateSavedViewInput,
) =>
  loadAdminSavedViewsRuntime().pipe(
    Effect.flatMap(({ runAdminSavedViewsFromEnvironment }) =>
      runAdminSavedViewsFromEnvironment(environment, (service) =>
        service.create(input),
      ),
    ),
  );

export const updateSavedViewFromEnvironment = (
  environment: unknown,
  input: UpdateSavedViewInput,
) =>
  loadAdminSavedViewsRuntime().pipe(
    Effect.flatMap(({ runAdminSavedViewsFromEnvironment }) =>
      runAdminSavedViewsFromEnvironment(environment, (service) =>
        service.update(input),
      ),
    ),
  );

export const deleteSavedViewFromEnvironment = (
  environment: unknown,
  input: DeleteSavedViewInput,
) =>
  loadAdminSavedViewsRuntime().pipe(
    Effect.flatMap(({ runAdminSavedViewsFromEnvironment }) =>
      runAdminSavedViewsFromEnvironment(environment, (service) =>
        service.delete(input),
      ),
    ),
  );

export const setPinnedSavedViewFromEnvironment = (
  environment: unknown,
  input: SetPinnedSavedViewInput,
) =>
  loadAdminSavedViewsRuntime().pipe(
    Effect.flatMap(({ runAdminSavedViewsFromEnvironment }) =>
      runAdminSavedViewsFromEnvironment(environment, (service) =>
        service.setPinned(input),
      ),
    ),
  );

export type { AdminSavedView };
