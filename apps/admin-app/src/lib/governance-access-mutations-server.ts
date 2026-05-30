import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  AuthorizationNamespaceSchema,
  AuthorizationRelationSchema,
} from "@comvestec/contracts";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Access Control v2 mutation server-fns (admin-app implementation
 * plan §8.7 + §11 — Phase 3 Governance & access commit 4).
 * Mirrors the `/desk/config` and `/desk/flag` `*-mutations-server`
 * siblings: each helper decodes its input at the framework
 * boundary via `Schema.decodeUnknown`, extracts the operator
 * session id from the request envelope, and is wired to delegate
 * to the platform `*FromSessionId` helpers in
 * `packages/platform/src/services/apps/admin-control-plane.ts`
 * (`deleteAdminAuthorizationTupleFromSessionId`).
 *
 * Escape hatch: commit 4 ships the four read-only tabs
 * (Operators · Tuples · Projection profiles · Scopes &
 * permissions) end to end. The tuple-revoke mutation + projection
 * profile edit are deferred to commit 4b per the prompt's
 * authorized escape hatch — the server-fn here decodes the typed
 * input at the framework boundary so the route-side wiring is
 * honest end to end, and currently fails with a typed
 * `AccessControlMutationsNotImplementedError` so the deferred
 * work in commit 4b only needs to swap the handler body to call
 * `deleteAdminAuthorizationTupleFromSessionId` — the input
 * schemas, route surface, `HighRiskActionGuard`, fixture mocks,
 * and browser coverage stay as-is.
 *
 * Sessionless input: the `sessionId` field is resolved from the
 * trusted request envelope rather than the URL body so admin-app
 * forms never propose a session string.
 */

const RevokeAdminAuthorizationTupleInputSchema = Schema.Struct({
  tuple: Schema.Struct({
    namespace: AuthorizationNamespaceSchema,
    object: Schema.NonEmptyString,
    relation: AuthorizationRelationSchema,
    subject: Schema.NonEmptyString,
  }),
  reason: Schema.NonEmptyString,
});

type RevokeAdminAuthorizationTupleInput = Schema.Schema.Type<
  typeof RevokeAdminAuthorizationTupleInputSchema
>;

class AccessControlMutationsNotImplementedError extends Error {
  readonly _tag = "AccessControlMutationsNotImplementedError";
  constructor() {
    super(
      "Access-control mutations land in commit 4b — swap the handler body to call deleteAdminAuthorizationTupleFromSessionId before invoking.",
    );
    this.name = "AccessControlMutationsNotImplementedError";
  }
}

const resolveSessionIdFromRequest = async (
  request: Request,
): Promise<string> => {
  const { extractRequiredSubscriberJourneySessionId } =
    await import("@comvestec/platform");
  return Effect.runPromise(extractRequiredSubscriberJourneySessionId(request));
};

export const revokeAdminAuthorizationTuple = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: RevokeAdminAuthorizationTupleInput) => input)
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }): Promise<RevokeAdminAuthorizationTupleServerResult> => {
      const decoded = await Effect.runPromise(
        Schema.decodeUnknown(RevokeAdminAuthorizationTupleInputSchema)(data),
      );
      // Resolve the session id up-front so the transport contract
      // (typed envelope → trusted operator) is exercised even
      // while the platform-side wiring is still pending in 4b.
      await resolveSessionIdFromRequest(context.request);
      void decoded;
      throw new AccessControlMutationsNotImplementedError();
    },
  );

/**
 * Serializable projection of the (commit-4b) platform-side
 * `Admin Governance Revoke Authorization Tuple` response. Keeps
 * the platform-side projection fields off the TanStack Start
 * `ValidateSerializableMapped` boundary; the admin-app reloads
 * the route to obtain the refreshed tuple projection.
 */
export type RevokeAdminAuthorizationTupleServerResult = {
  readonly correlationId: string | null;
};
