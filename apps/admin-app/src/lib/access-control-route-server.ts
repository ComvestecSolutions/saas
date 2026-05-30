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
import { decodeSyncBoundary } from "./effect-boundary";

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
  readonly data: DeleteAdminAuthorizationTupleInput;
  readonly execute: (requestInput: {
    readonly sessionId: string;
    readonly tuple: AdminGovernanceAuthorizationTupleView;
    readonly reason: string;
  }) => Promise<Result>;
}) => {
  const { extractRequiredSubscriberJourneySessionId } =
    await import("@comvestec/platform");
  const sessionId = await Effect.runPromise(
    extractRequiredSubscriberJourneySessionId(input.request),
  );

  return input.execute({
    sessionId,
    tuple: input.data.tuple,
    reason: input.data.reason,
  });
};

const runProvisionAdminOperator = async <Result>(input: {
  readonly request: Request;
  readonly data: ProvisionAdminOperatorInput;
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
  const { extractRequiredSubscriberJourneySessionId } =
    await import("@comvestec/platform");
  const sessionId = await Effect.runPromise(
    extractRequiredSubscriberJourneySessionId(input.request),
  );

  return input.execute({
    sessionId,
    displayName: input.data.displayName,
    email: input.data.email,
    ...(input.data.username === undefined
      ? {}
      : { username: input.data.username }),
    actorType: input.data.actorType,
    reason: input.data.reason,
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
    .inputValidator(
      decodeSyncBoundary(DeleteAdminAuthorizationTupleInputSchema),
    )
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: DeleteAdminAuthorizationTupleInput;
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
  .inputValidator(decodeSyncBoundary(DeleteAdminAuthorizationTupleInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: DeleteAdminAuthorizationTupleInput;
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
    .inputValidator(decodeSyncBoundary(ProvisionAdminOperatorInputSchema))
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: ProvisionAdminOperatorInput;
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
  .inputValidator(decodeSyncBoundary(ProvisionAdminOperatorInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: ProvisionAdminOperatorInput;
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
