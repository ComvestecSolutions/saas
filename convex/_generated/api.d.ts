/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as billingConvergenceScheduling from "../billingConvergenceScheduling.js";
import type * as crons from "../crons.js";
import type * as keycloakWorkflowIdentity from "../keycloakWorkflowIdentity.js";
import type * as schedulerBackedConvexAdapter from "../schedulerBackedConvexAdapter.js";
import type * as workflowJobRunner from "../workflowJobRunner.js";
import type * as workflowJobs from "../workflowJobs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  billingConvergenceScheduling: typeof billingConvergenceScheduling;
  crons: typeof crons;
  keycloakWorkflowIdentity: typeof keycloakWorkflowIdentity;
  schedulerBackedConvexAdapter: typeof schedulerBackedConvexAdapter;
  workflowJobRunner: typeof workflowJobRunner;
  workflowJobs: typeof workflowJobs;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
