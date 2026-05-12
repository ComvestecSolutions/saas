import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type CreateNotificationCenterInAppNotificationInput,
  CreateNotificationCenterInAppNotificationInputSchema,
  type DismissNotificationCenterInAppNotificationInput,
  DismissNotificationCenterInAppNotificationInputSchema,
  type ListNotificationCenterInAppNotificationsInput,
  ListNotificationCenterInAppNotificationsInputSchema,
  type MarkNotificationCenterInAppNotificationReadInput,
  MarkNotificationCenterInAppNotificationReadInputSchema,
  type NotificationCenterInAppNotificationRecord,
  NotificationCenterInAppNotificationRecordListSchema,
  NotificationCenterInAppNotificationRecordSchema,
  type NotificationCenterInAppNotificationReference,
  NotificationCenterInAppNotificationReferenceSchema,
} from "@comvestec/contracts";
import {
  type KeycloakAdapterRequestError,
  type KeycloakPasswordGrantIdTokenMissingError,
  makeKeycloakAdapter,
} from "../identity/keycloak";
import {
  createConvexRuntimeHealthcheck,
  type ConvexRuntimeHealthcheckError,
} from "./convex-runtime";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const ConvexNotificationCenterInAppAdapterOptionsSchema = Schema.Struct({
  deploymentUrl: Schema.NonEmptyString,
  siteUrl: Schema.NonEmptyString,
  keycloakBaseUrl: Schema.NonEmptyString,
  keycloakRealm: Schema.NonEmptyString,
  keycloakClientId: Schema.NonEmptyString,
  keycloakClientSecret: Schema.NonEmptyString,
  keycloakConvexServiceActorUsername: Schema.NonEmptyString,
  keycloakConvexServiceActorPassword: Schema.NonEmptyString,
});

type ConvexNotificationCenterInAppAdapterRuntimeOptions = Schema.Schema.Type<
  typeof ConvexNotificationCenterInAppAdapterOptionsSchema
>;

export type ConvexNotificationCenterInAppAdapterOptions =
  ConvexNotificationCenterInAppAdapterRuntimeOptions & {
    readonly fetch?: typeof fetch;
  };

const ConvexNotificationCenterInAppHealthcheckSchema =
  createPlatformAdapterHealthcheckSchema(platformAdapterServiceName.convex);

export type ConvexNotificationCenterInAppHealthcheck = Schema.Schema.Type<
  typeof ConvexNotificationCenterInAppHealthcheckSchema
>;

export type ConvexNotificationCenterInAppAdapterRequestError = {
  readonly _tag: "ConvexNotificationCenterInAppAdapterRequestError";
  readonly operation:
    | "createInAppNotificationRecord"
    | "getInAppNotificationRecord"
    | "listInAppNotificationRecords"
    | "markInAppNotificationRead"
    | "dismissInAppNotification";
  readonly cause: unknown;
  readonly status?: number;
  readonly body?: string;
};

export type ConvexNotificationCenterInAppAdapterError =
  | ParseResult.ParseError
  | KeycloakAdapterRequestError
  | KeycloakPasswordGrantIdTokenMissingError
  | ConvexNotificationCenterInAppAdapterRequestError;

export type ConvexNotificationCenterInAppAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.convex;
  readonly deploymentUrl: string;
  readonly siteUrl: string;
  readonly healthcheck: Effect.Effect<
    ConvexNotificationCenterInAppHealthcheck,
    ConvexRuntimeHealthcheckError
  >;
  readonly createInAppNotificationRecord: (
    input: CreateNotificationCenterInAppNotificationInput,
  ) => Effect.Effect<
    NotificationCenterInAppNotificationRecord,
    ConvexNotificationCenterInAppAdapterError
  >;
  readonly getInAppNotificationRecord: (
    input: NotificationCenterInAppNotificationReference,
  ) => Effect.Effect<
    NotificationCenterInAppNotificationRecord | undefined,
    ConvexNotificationCenterInAppAdapterError
  >;
  readonly listInAppNotificationRecords: (
    input: ListNotificationCenterInAppNotificationsInput,
  ) => Effect.Effect<
    readonly NotificationCenterInAppNotificationRecord[],
    ConvexNotificationCenterInAppAdapterError
  >;
  readonly markInAppNotificationRead: (
    input: MarkNotificationCenterInAppNotificationReadInput,
  ) => Effect.Effect<
    NotificationCenterInAppNotificationRecord | undefined,
    ConvexNotificationCenterInAppAdapterError
  >;
  readonly dismissInAppNotification: (
    input: DismissNotificationCenterInAppNotificationInput,
  ) => Effect.Effect<
    NotificationCenterInAppNotificationRecord | undefined,
    ConvexNotificationCenterInAppAdapterError
  >;
};

export class ConvexNotificationCenterInAppAdapter extends Context.Tag(
  "ConvexNotificationCenterInAppAdapter",
)<
  ConvexNotificationCenterInAppAdapter,
  ConvexNotificationCenterInAppAdapterService
>() {}

type ConvexAuthenticatedHttpClient = ConvexHttpClient & {
  readonly setAuth: (token: string) => void;
  readonly setDebug: (enabled: boolean) => void;
};

const createInAppNotificationRecordMutation = makeFunctionReference<
  "mutation",
  NotificationCenterInAppNotificationRecord,
  NotificationCenterInAppNotificationRecord
>("notificationCenterInApp:createInAppNotificationRecord");

const getInAppNotificationRecordQuery = makeFunctionReference<
  "query",
  NotificationCenterInAppNotificationReference,
  NotificationCenterInAppNotificationRecord | null
>("notificationCenterInApp:getInAppNotificationRecord");

const listInAppNotificationRecordsQuery = makeFunctionReference<
  "query",
  ListNotificationCenterInAppNotificationsInput,
  readonly NotificationCenterInAppNotificationRecord[]
>("notificationCenterInApp:listInAppNotificationRecords");

const markInAppNotificationReadMutation = makeFunctionReference<
  "mutation",
  MarkNotificationCenterInAppNotificationReadInput,
  NotificationCenterInAppNotificationRecord | null
>("notificationCenterInApp:markInAppNotificationRead");

const dismissInAppNotificationMutation = makeFunctionReference<
  "mutation",
  DismissNotificationCenterInAppNotificationInput,
  NotificationCenterInAppNotificationRecord | null
>("notificationCenterInApp:dismissInAppNotification");

const decodeCreateNotificationCenterInAppNotificationInput =
  Schema.decodeUnknown(CreateNotificationCenterInAppNotificationInputSchema);

const decodeNotificationCenterInAppNotificationRecord = Schema.decodeUnknown(
  NotificationCenterInAppNotificationRecordSchema,
);

const decodeNotificationCenterInAppNotificationRecordList =
  Schema.decodeUnknown(NotificationCenterInAppNotificationRecordListSchema);

const decodeNotificationCenterInAppNotificationReference = Schema.decodeUnknown(
  NotificationCenterInAppNotificationReferenceSchema,
);

const decodeListNotificationCenterInAppNotificationsInput =
  Schema.decodeUnknown(ListNotificationCenterInAppNotificationsInputSchema);

const decodeMarkNotificationCenterInAppNotificationReadInput =
  Schema.decodeUnknown(MarkNotificationCenterInAppNotificationReadInputSchema);

const decodeDismissNotificationCenterInAppNotificationInput =
  Schema.decodeUnknown(DismissNotificationCenterInAppNotificationInputSchema);

const buildConvexNotificationCenterInAppAdapterRequestError = (
  operation: ConvexNotificationCenterInAppAdapterRequestError["operation"],
  cause: unknown,
): ConvexNotificationCenterInAppAdapterRequestError =>
  ({
    _tag: "ConvexNotificationCenterInAppAdapterRequestError",
    operation,
    cause,
    ...(typeof cause === "object" &&
    cause !== null &&
    "status" in cause &&
    typeof cause.status === "number"
      ? { status: cause.status }
      : {}),
    ...(typeof cause === "object" &&
    cause !== null &&
    "body" in cause &&
    typeof cause.body === "string"
      ? { body: cause.body }
      : {}),
  }) satisfies ConvexNotificationCenterInAppAdapterRequestError;

const createConvexHttpClient = (deploymentUrl: string) => {
  const convex = new ConvexHttpClient(deploymentUrl, {
    logger: false,
    skipConvexDeploymentUrlCheck: true,
  }) as ConvexAuthenticatedHttpClient;

  convex.setDebug(false);

  return convex;
};

export const makeConvexNotificationCenterInAppAdapter = (
  input: ConvexNotificationCenterInAppAdapterOptions,
) =>
  Schema.decodeUnknown(ConvexNotificationCenterInAppAdapterOptionsSchema)(
    input,
  ).pipe(
    Effect.flatMap((options) =>
      makeKeycloakAdapter({
        baseUrl: options.keycloakBaseUrl,
        realm: options.keycloakRealm,
        clientId: options.keycloakClientId,
        clientSecret: options.keycloakClientSecret,
      }).pipe(
        Effect.map((keycloak): ConvexNotificationCenterInAppAdapterService => {
          const invokeAuthenticatedRequest = <A>(request: {
            readonly operation: ConvexNotificationCenterInAppAdapterRequestError["operation"];
            readonly invoke: (
              client: ConvexAuthenticatedHttpClient,
            ) => Promise<A>;
          }) =>
            keycloak
              .issueIdTokenWithPasswordGrant({
                username: options.keycloakConvexServiceActorUsername,
                password: options.keycloakConvexServiceActorPassword,
              })
              .pipe(
                Effect.flatMap((authToken) =>
                  Effect.tryPromise({
                    try: async () => {
                      const convex = createConvexHttpClient(
                        options.deploymentUrl,
                      );

                      convex.setAuth(authToken);

                      return await request.invoke(convex);
                    },
                    catch: (cause) =>
                      buildConvexNotificationCenterInAppAdapterRequestError(
                        request.operation,
                        cause,
                      ),
                  }),
                ),
              );

          return {
            serviceName: platformAdapterServiceName.convex,
            deploymentUrl: options.deploymentUrl,
            siteUrl: options.siteUrl,
            healthcheck: createConvexRuntimeHealthcheck({
              deploymentUrl: options.deploymentUrl,
              fetchImplementation: input.fetch ?? fetch,
            }),
            createInAppNotificationRecord: (input) =>
              decodeCreateNotificationCenterInAppNotificationInput(input).pipe(
                Effect.flatMap((request) =>
                  Schema.decodeUnknown(
                    NotificationCenterInAppNotificationRecordSchema,
                  )({
                    notificationId: [
                      "notification-center",
                      "in-app",
                      request.tenantScope,
                      request.tenantScopeId,
                      request.actorId,
                      request.family,
                      request.sourceEventId,
                    ].join(":"),
                    sourceEventId: request.sourceEventId,
                    sourceModuleId: request.sourceModuleId,
                    tenantScope: request.tenantScope,
                    tenantScopeId: request.tenantScopeId,
                    actorId: request.actorId,
                    channel: "in-app",
                    family: request.family,
                    status: "unread",
                    ...(request.title !== undefined
                      ? { title: request.title }
                      : {}),
                    ...(request.bodySummary !== undefined
                      ? { bodySummary: request.bodySummary }
                      : {}),
                    ...(request.actionLabel !== undefined
                      ? { actionLabel: request.actionLabel }
                      : {}),
                    ...(request.actionUrl !== undefined
                      ? { actionUrl: request.actionUrl }
                      : {}),
                    ...(request.correlationId !== undefined
                      ? { correlationId: request.correlationId }
                      : {}),
                    ...(request.correlatedEmailReceiptId !== undefined
                      ? {
                          correlatedEmailReceiptId:
                            request.correlatedEmailReceiptId,
                        }
                      : {}),
                    ...(request.correlatedDigestRunId !== undefined
                      ? {
                          correlatedDigestRunId: request.correlatedDigestRunId,
                        }
                      : {}),
                    createdAt: request.createdAt,
                    updatedAt: request.createdAt,
                  }),
                ),
                Effect.flatMap((record) =>
                  invokeAuthenticatedRequest({
                    operation: "createInAppNotificationRecord",
                    invoke: async (convex) =>
                      await convex.mutation(
                        createInAppNotificationRecordMutation,
                        record,
                        { skipQueue: true },
                      ),
                  }),
                ),
                Effect.flatMap((record) =>
                  decodeNotificationCenterInAppNotificationRecord(record),
                ),
              ),
            getInAppNotificationRecord: (input) =>
              decodeNotificationCenterInAppNotificationReference(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "getInAppNotificationRecord",
                    invoke: async (convex) =>
                      await convex.query(
                        getInAppNotificationRecordQuery,
                        request,
                      ),
                  }),
                ),
                Effect.flatMap((record) =>
                  record === null
                    ? Effect.succeed(undefined)
                    : decodeNotificationCenterInAppNotificationRecord(record),
                ),
              ),
            listInAppNotificationRecords: (input) =>
              decodeListNotificationCenterInAppNotificationsInput(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "listInAppNotificationRecords",
                    invoke: async (convex) =>
                      await convex.query(
                        listInAppNotificationRecordsQuery,
                        request,
                      ),
                  }),
                ),
                Effect.flatMap((records) =>
                  decodeNotificationCenterInAppNotificationRecordList(records),
                ),
              ),
            markInAppNotificationRead: (input) =>
              decodeMarkNotificationCenterInAppNotificationReadInput(
                input,
              ).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "markInAppNotificationRead",
                    invoke: async (convex) =>
                      await convex.mutation(
                        markInAppNotificationReadMutation,
                        request,
                        { skipQueue: true },
                      ),
                  }),
                ),
                Effect.flatMap((record) =>
                  record === null
                    ? Effect.succeed(undefined)
                    : decodeNotificationCenterInAppNotificationRecord(record),
                ),
              ),
            dismissInAppNotification: (input) =>
              decodeDismissNotificationCenterInAppNotificationInput(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "dismissInAppNotification",
                    invoke: async (convex) =>
                      await convex.mutation(
                        dismissInAppNotificationMutation,
                        request,
                        { skipQueue: true },
                      ),
                  }),
                ),
                Effect.flatMap((record) =>
                  record === null
                    ? Effect.succeed(undefined)
                    : decodeNotificationCenterInAppNotificationRecord(record),
                ),
              ),
          } satisfies ConvexNotificationCenterInAppAdapterService;
        }),
      ),
    ),
  );

export const makeConvexNotificationCenterInAppAdapterLayer = (
  options: ConvexNotificationCenterInAppAdapterOptions,
) =>
  Layer.effect(
    ConvexNotificationCenterInAppAdapter,
    makeConvexNotificationCenterInAppAdapter(options),
  );
