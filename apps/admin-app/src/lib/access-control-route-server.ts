import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  actorType,
  authorizationNamespaces,
  authorizationRelations,
} from "@comvestec/contracts";
import type {
  deleteAdminAuthorizationTupleFromSessionId,
  AdminGovernanceAuthorizationTupleView,
  provisionAdminOperatorFromSessionId,
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

const ProvisionAdminOperatorInputSchema = Schema.Struct({
  displayName: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
  username: Schema.optional(Schema.NonEmptyString),
  actorType: Schema.Literal(
    actorType.platformOperator,
    actorType.supportOperator,
  ),
  reason: Schema.NonEmptyString,
});

type ProvisionAdminOperatorInput = Schema.Schema.Type<
  typeof ProvisionAdminOperatorInputSchema
>;

type DeleteAdminAuthorizationTuple = (
  environment: unknown,
  input: {
    readonly sessionId: string;
    readonly tuple: AdminGovernanceAuthorizationTupleView;
    readonly reason: string;
  },
) => ReturnType<typeof deleteAdminAuthorizationTupleFromSessionId>;

type ProvisionAdminOperator = (
  environment: unknown,
  input: {
    readonly sessionId: string;
    readonly displayName: string;
    readonly email: string;
    readonly username?: string;
    readonly actorType:
      | typeof actorType.platformOperator
      | typeof actorType.supportOperator;
    readonly reason: string;
  },
) => ReturnType<typeof provisionAdminOperatorFromSessionId>;

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

const runProvisionAdminOperator = async <Result>(input: {
  readonly request: Request;
  readonly data: unknown;
  readonly execute: (requestInput: {
    readonly sessionId: string;
    readonly displayName: string;
    readonly email: string;
    readonly username?: string;
    readonly actorType:
      | typeof actorType.platformOperator
      | typeof actorType.supportOperator;
    readonly reason: string;
  }) => Promise<Result>;
}) => {
  const requestData = await Effect.runPromise(
    Schema.decodeUnknown(ProvisionAdminOperatorInputSchema)(input.data),
  );
  const { extractRequiredSubscriberJourneySessionId } =
    await import("@comvestec/platform");
  const sessionId = await Effect.runPromise(
    extractRequiredSubscriberJourneySessionId(input.request),
  );

  return input.execute({
    sessionId,
    displayName: requestData.displayName,
    email: requestData.email,
    ...(requestData.username === undefined
      ? {}
      : { username: requestData.username }),
    actorType: requestData.actorType,
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

export const createProvisionAdminAccessControlOperator = (
  provisionAdminOperator: ProvisionAdminOperator | undefined = undefined,
  environment: unknown = process.env,
  accessControlServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  accessControlServerFn
    .createServerFn({ method: "POST" })
    .middleware([createAdminRequestMiddleware(accessControlServerFn)])
    .inputValidator((input: ProvisionAdminOperatorInput) => input)
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: unknown;
      }) =>
        runProvisionAdminOperator({
          request: context.request,
          data,
          execute: async (requestInput) => {
            if (provisionAdminOperator !== undefined) {
              return Effect.runPromise(
                provisionAdminOperator(environment, requestInput),
              );
            }

            const { provisionAdminOperatorFromSessionId } =
              await import("@comvestec/platform");

            return Effect.runPromise(
              provisionAdminOperatorFromSessionId(environment, requestInput),
            );
          },
        }),
    );

export const provisionAdminAccessControlOperator = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: ProvisionAdminOperatorInput) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }) =>
      runProvisionAdminOperator({
        request: context.request,
        data,
        execute: async (requestInput) => {
          const { provisionAdminOperatorFromSessionId } =
            await import("@comvestec/platform");

          return Effect.runPromise(
            provisionAdminOperatorFromSessionId(process.env, requestInput),
          );
        },
      }),
  );
