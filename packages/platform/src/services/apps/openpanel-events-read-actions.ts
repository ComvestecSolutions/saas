import { Effect } from "effect";
import type {
  OpenPanelEvent,
  OpenPanelEventGetByIdInput,
  OpenPanelEventList,
  OpenPanelEventListByEventNameInput,
  OpenPanelEventListByProjectInput,
  RequestContext,
} from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the OpenPanel events read platform
 * service (admin-app implementation plan §9 item 10 — batch B
 * vendor #4).
 *
 * Mirrors the postal-mail-log-read-actions.ts /
 * novu-deliveries-read-actions.ts / open-meter-meter-read-actions.ts /
 * keycloak-user-read-actions.ts / polar-customer-read-actions.ts /
 * glitchtip-issues-read-actions.ts pattern: helpers stay free of any
 * `Request` / `Response` shaping, never own a duplicate
 * `Effect.tryPromise`, and load the env-bound service runtime through
 * the single `loadRuntimeModuleOrDie` seam so the import graph remains
 * safe to evaluate at app root scope.
 */
const loadOpenPanelEventsReadRuntime = () =>
  loadRuntimeModuleOrDie(
    () => import("../domains/openpanel-events-read-service"),
  );

export const getOpenPanelEventByIdFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: OpenPanelEventGetByIdInput;
  },
) =>
  loadOpenPanelEventsReadRuntime().pipe(
    Effect.flatMap(({ runOpenPanelEventsReadFromEnvironment }) =>
      runOpenPanelEventsReadFromEnvironment(environment, (service) =>
        service.getById(input),
      ),
    ),
  );

export const listOpenPanelEventsByProjectFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: OpenPanelEventListByProjectInput;
  },
) =>
  loadOpenPanelEventsReadRuntime().pipe(
    Effect.flatMap(({ runOpenPanelEventsReadFromEnvironment }) =>
      runOpenPanelEventsReadFromEnvironment(environment, (service) =>
        service.listByProject(input),
      ),
    ),
  );

export const listOpenPanelEventsByEventNameFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly query: OpenPanelEventListByEventNameInput;
  },
) =>
  loadOpenPanelEventsReadRuntime().pipe(
    Effect.flatMap(({ runOpenPanelEventsReadFromEnvironment }) =>
      runOpenPanelEventsReadFromEnvironment(environment, (service) =>
        service.listByEventName(input),
      ),
    ),
  );

export type {
  OpenPanelEvent,
  OpenPanelEventGetByIdInput,
  OpenPanelEventList,
  OpenPanelEventListByEventNameInput,
  OpenPanelEventListByProjectInput,
};
