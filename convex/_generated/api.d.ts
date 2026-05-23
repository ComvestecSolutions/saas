/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as billingConvergenceScheduling from "../billingConvergenceScheduling.js";
import type * as crons from "../crons.js";
import type * as fileStorage from "../fileStorage.js";
import type * as keycloakWorkflowIdentity from "../keycloakWorkflowIdentity.js";
import type * as notificationCenterInApp from "../notificationCenterInApp.js";
import type * as schedulerBackedConvexAdapter from "../schedulerBackedConvexAdapter.js";
import type * as workflowJobRunner from "../workflowJobRunner.js";
import type * as workflowJobs from "../workflowJobs.js";
import type * as workflowScheduling from "../workflowScheduling.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  billingConvergenceScheduling: typeof billingConvergenceScheduling;
  crons: typeof crons;
  fileStorage: typeof fileStorage;
  keycloakWorkflowIdentity: typeof keycloakWorkflowIdentity;
  notificationCenterInApp: typeof notificationCenterInApp;
  schedulerBackedConvexAdapter: typeof schedulerBackedConvexAdapter;
  workflowJobRunner: typeof workflowJobRunner;
  workflowJobs: typeof workflowJobs;
  workflowScheduling: typeof workflowScheduling;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
