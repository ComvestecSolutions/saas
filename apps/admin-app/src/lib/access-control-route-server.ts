import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  authorizationNamespaces,
  authorizationRelations,
} from "@comvestec/contracts";
import type {
  deleteAdminAuthorizationTupleFromSessionId,
  AdminGovernanceAuthorizationTupleView,
} from "@comvestec/platform";
import {
  adminRequestServerMiddleware,
  createAdminRequestMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import {
  tanstackStartServerRuntime,
  type TanstackStartServerRuntime,
} from "./tanstack-start-server-runtime";

const AdminAccessControlTupleInputSchema = Schema.Struct({
  namespace: Schema.Literal(...authorizationNamespaces),
  object: Schema.NonEmptyString,
  relation: Schema.Literal(...authorizationRelations),
  subject: Schema.NonEmptyString,
});

const DeleteAdminAuthorizationTupleInputSchema = Schema.Struct({
  tuple: AdminAccessControlTupleInputSchema,
  reason: Schema.NonEmptyString,
});

type DeleteAdminAuthorizationTupleInput = Schema.Schema.Type<
  typeof DeleteAdminAuthorizationTupleInputSchema
>;

type DeleteAdminAuthorizationTuple = (
  environment: unknown,
  input: {
    readonly sessionId: string;
    readonly tuple: AdminGovernanceAuthorizationTupleView;
    readonly reason: string;
  },
) => ReturnType<typeof deleteAdminAuthorizationTupleFromSessionId>;

const runDeleteAdminAuthorizationTuple = async <Result>(input: {
  readonly request: Request;
  readonly data: unknown;
  readonly execute: (requestInput: {
    readonly sessionId: string;
    readonly tuple: AdminGovernanceAuthorizationTupleView;
    readonly reason: string;
  }) => Promise<Result>;
}) => {
  const requestData = await Effect.runPromise(
    Schema.decodeUnknown(DeleteAdminAuthorizationTupleInputSchema)(input.data),
  );
  const { extractRequiredSubscriberJourneySessionId } =
    await import("@comvestec/platform");
  const sessionId = await Effect.runPromise(
    extractRequiredSubscriberJourneySessionId(input.request),
  );

  return input.execute({
    sessionId,
    tuple: requestData.tuple,
    reason: requestData.reason,
  });
};

export const createDeleteAdminAccessControlTuple = (
  deleteAdminAuthorizationTuple:
    | DeleteAdminAuthorizationTuple
    | undefined = undefined,
  environment: unknown = process.env,
  accessControlServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  accessControlServerFn
    .createServerFn({ method: "POST" })
    .middleware([createAdminRequestMiddleware(accessControlServerFn)])
    .inputValidator((input: DeleteAdminAuthorizationTupleInput) => input)
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: unknown;
      }) =>
        runDeleteAdminAuthorizationTuple({
          request: context.request,
          data,
          execute: async (requestInput) => {
            if (deleteAdminAuthorizationTuple !== undefined) {
              return Effect.runPromise(
                deleteAdminAuthorizationTuple(environment, requestInput),
              );
            }

            const { deleteAdminAuthorizationTupleFromSessionId } =
              await import("@comvestec/platform");

            return Effect.runPromise(
              deleteAdminAuthorizationTupleFromSessionId(
                environment,
                requestInput,
              ),
            );
          },
        }),
    );

export const deleteAdminAccessControlTuple = createServerFn({ method: "POST" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: DeleteAdminAuthorizationTupleInput) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }) =>
      runDeleteAdminAuthorizationTuple({
        request: context.request,
        data,
        execute: async (requestInput) => {
          const { deleteAdminAuthorizationTupleFromSessionId } =
            await import("@comvestec/platform");

          return Effect.runPromise(
            deleteAdminAuthorizationTupleFromSessionId(
              process.env,
              requestInput,
            ),
          );
        },
      }),
  );
