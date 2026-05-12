import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  actorType,
  IsoTimestampSchema,
  identityClaimKey,
  type WorkflowJobSummaryList,
  WorkflowJobSummaryListSchema,
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

const ConvexAdapterOptionsSchema = Schema.Struct({
  deploymentUrl: Schema.NonEmptyString,
  siteUrl: Schema.NonEmptyString,
  adminKey: Schema.optional(Schema.NonEmptyString),
  keycloakBaseUrl: Schema.NonEmptyString,
  keycloakRealm: Schema.NonEmptyString,
  keycloakClientId: Schema.NonEmptyString,
  keycloakClientSecret: Schema.NonEmptyString,
  keycloakConvexServiceActorUsername: Schema.NonEmptyString,
  keycloakConvexServiceActorPassword: Schema.NonEmptyString,
});

type ConvexAdapterRuntimeOptions = Schema.Schema.Type<
  typeof ConvexAdapterOptionsSchema
>;

export type ConvexAdapterOptions = ConvexAdapterRuntimeOptions & {
  readonly fetch?: typeof fetch;
};

const ConvexHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.convex,
);

const ConvexScheduledWorkflowDispatchSchema = Schema.Struct({
  scheduledFunctionId: Schema.NonEmptyString,
  scheduledFunctionIds: Schema.Array(Schema.NonEmptyString),
  primaryScheduled: Schema.Boolean,
  scheduledRecoveryAttemptCount: Schema.Number,
  expectedRecoveryAttemptCount: Schema.Number,
});

const ConvexScheduledWorkflowDispatchWireSchema = Schema.Struct({
  scheduledFunctionId: Schema.NonEmptyString,
  scheduledFunctionIds: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  primaryScheduled: Schema.Boolean,
  scheduledRecoveryAttemptCount: Schema.Number,
  expectedRecoveryAttemptCount: Schema.Number,
});

const BillingReconciliationWorkflowDispatchInputSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  scheduledAt: IsoTimestampSchema,
});

const SearchTenantIndexEnsureWorkflowDispatchInputSchema =
  BillingReconciliationWorkflowDispatchInputSchema;

const ImportExportManagedFileSummaryWorkflowDispatchInputSchema =
  BillingReconciliationWorkflowDispatchInputSchema;

const ImportExportSupportCaseSummaryWorkflowDispatchInputSchema =
  BillingReconciliationWorkflowDispatchInputSchema;

const NotificationCenterEmailDigestWorkflowDispatchInputSchema =
  BillingReconciliationWorkflowDispatchInputSchema;

const WebhookOutboundDeliveryWorkflowDispatchInputSchema =
  BillingReconciliationWorkflowDispatchInputSchema;

const TenantInvitationReminderWorkflowDispatchInputSchema =
  BillingReconciliationWorkflowDispatchInputSchema;

const TenantInvitationExpiryNotificationWorkflowDispatchInputSchema =
  BillingReconciliationWorkflowDispatchInputSchema;

const BillingConvergenceWorkflowJobExecutionInputSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
});

const SearchTenantIndexEnsureWorkflowJobExecutionInputSchema =
  BillingConvergenceWorkflowJobExecutionInputSchema;

const ImportExportManagedFileSummaryWorkflowJobExecutionInputSchema =
  BillingConvergenceWorkflowJobExecutionInputSchema;

const ImportExportSupportCaseSummaryWorkflowJobExecutionInputSchema =
  BillingConvergenceWorkflowJobExecutionInputSchema;

const NotificationCenterEmailDigestWorkflowJobExecutionInputSchema =
  BillingConvergenceWorkflowJobExecutionInputSchema;

const WebhookOutboundDeliveryWorkflowJobExecutionInputSchema =
  BillingConvergenceWorkflowJobExecutionInputSchema;

const TenantInvitationReminderWorkflowJobExecutionInputSchema =
  BillingConvergenceWorkflowJobExecutionInputSchema;

const TenantInvitationExpiryNotificationWorkflowJobExecutionInputSchema =
  BillingConvergenceWorkflowJobExecutionInputSchema;

const CancelScheduledWorkflowJobInputSchema = Schema.Struct({
  scheduledFunctionId: Schema.NonEmptyString,
});

const BillingConvergenceWorkflowJobRunInputSchema = Schema.Struct({
  now: Schema.optional(IsoTimestampSchema),
});

const ConvexAuthenticatedRequestOptionsSchema = Schema.Struct({
  authToken: Schema.optional(Schema.NonEmptyString),
});

export type ConvexHealthcheck = Schema.Schema.Type<
  typeof ConvexHealthcheckSchema
>;

export type ConvexScheduledWorkflowDispatch = Schema.Schema.Type<
  typeof ConvexScheduledWorkflowDispatchSchema
>;

type ConvexScheduledWorkflowDispatchWire = Schema.Schema.Type<
  typeof ConvexScheduledWorkflowDispatchWireSchema
>;

export type BillingReconciliationWorkflowDispatchInput = Schema.Schema.Type<
  typeof BillingReconciliationWorkflowDispatchInputSchema
>;

export type SearchTenantIndexEnsureWorkflowDispatchInput = Schema.Schema.Type<
  typeof SearchTenantIndexEnsureWorkflowDispatchInputSchema
>;

export type ImportExportManagedFileSummaryWorkflowDispatchInput =
  Schema.Schema.Type<
    typeof ImportExportManagedFileSummaryWorkflowDispatchInputSchema
  >;

export type ImportExportSupportCaseSummaryWorkflowDispatchInput =
  Schema.Schema.Type<
    typeof ImportExportSupportCaseSummaryWorkflowDispatchInputSchema
  >;

export type NotificationCenterEmailDigestWorkflowDispatchInput =
  Schema.Schema.Type<
    typeof NotificationCenterEmailDigestWorkflowDispatchInputSchema
  >;

export type WebhookOutboundDeliveryWorkflowDispatchInput = Schema.Schema.Type<
  typeof WebhookOutboundDeliveryWorkflowDispatchInputSchema
>;

export type TenantInvitationReminderWorkflowDispatchInput = Schema.Schema.Type<
  typeof TenantInvitationReminderWorkflowDispatchInputSchema
>;

export type TenantInvitationExpiryNotificationWorkflowDispatchInput =
  Schema.Schema.Type<
    typeof TenantInvitationExpiryNotificationWorkflowDispatchInputSchema
  >;

export type BillingConvergenceWorkflowJobExecutionInput = Schema.Schema.Type<
  typeof BillingConvergenceWorkflowJobExecutionInputSchema
>;

export type SearchTenantIndexEnsureWorkflowJobExecutionInput =
  Schema.Schema.Type<
    typeof SearchTenantIndexEnsureWorkflowJobExecutionInputSchema
  >;

export type ImportExportManagedFileSummaryWorkflowJobExecutionInput =
  Schema.Schema.Type<
    typeof ImportExportManagedFileSummaryWorkflowJobExecutionInputSchema
  >;

export type ImportExportSupportCaseSummaryWorkflowJobExecutionInput =
  Schema.Schema.Type<
    typeof ImportExportSupportCaseSummaryWorkflowJobExecutionInputSchema
  >;

export type NotificationCenterEmailDigestWorkflowJobExecutionInput =
  Schema.Schema.Type<
    typeof NotificationCenterEmailDigestWorkflowJobExecutionInputSchema
  >;

export type WebhookOutboundDeliveryWorkflowJobExecutionInput =
  Schema.Schema.Type<
    typeof WebhookOutboundDeliveryWorkflowJobExecutionInputSchema
  >;

export type TenantInvitationReminderWorkflowJobExecutionInput =
  Schema.Schema.Type<
    typeof TenantInvitationReminderWorkflowJobExecutionInputSchema
  >;

export type TenantInvitationExpiryNotificationWorkflowJobExecutionInput =
  Schema.Schema.Type<
    typeof TenantInvitationExpiryNotificationWorkflowJobExecutionInputSchema
  >;

export type CancelScheduledWorkflowJobInput = Schema.Schema.Type<
  typeof CancelScheduledWorkflowJobInputSchema
>;

export type BillingConvergenceWorkflowJobRunInput = Schema.Schema.Type<
  typeof BillingConvergenceWorkflowJobRunInputSchema
>;

export type ConvexAuthenticatedRequestOptions = Schema.Schema.Type<
  typeof ConvexAuthenticatedRequestOptionsSchema
>;

const decodeConvexScheduledWorkflowDispatch = (payload: unknown) =>
  Schema.decodeUnknown(ConvexScheduledWorkflowDispatchWireSchema)(payload).pipe(
    Effect.flatMap((dispatch: ConvexScheduledWorkflowDispatchWire) =>
      Schema.decodeUnknown(ConvexScheduledWorkflowDispatchSchema)({
        scheduledFunctionId: dispatch.scheduledFunctionId,
        scheduledFunctionIds: dispatch.scheduledFunctionIds ?? [
          dispatch.scheduledFunctionId,
        ],
        primaryScheduled: dispatch.primaryScheduled,
        scheduledRecoveryAttemptCount: dispatch.scheduledRecoveryAttemptCount,
        expectedRecoveryAttemptCount: dispatch.expectedRecoveryAttemptCount,
      }),
    ),
  );

export type ConvexAdapterRequestError = {
  readonly _tag: "ConvexAdapterRequestError";
  readonly operation:
    | "scheduleBillingReconciliationWorkflowJob"
    | "scheduleSearchTenantIndexEnsureWorkflowJob"
    | "scheduleImportExportManagedFileSummaryWorkflowJob"
    | "scheduleImportExportSupportCaseSummaryWorkflowJob"
    | "scheduleNotificationCenterEmailDigestWorkflowJob"
    | "scheduleWebhookOutboundDeliveryWorkflowJob"
    | "scheduleTenantInvitationReminderWorkflowJob"
    | "scheduleTenantInvitationExpiryNotificationWorkflowJob"
    | "cancelScheduledWorkflowJob"
    | "runBillingConvergenceJob"
    | "recoverBillingConvergenceJob"
    | "runDueBillingConvergenceJobs"
    | "runSearchTenantIndexEnsureWorkflowJob"
    | "runImportExportManagedFileSummaryWorkflowJob"
    | "runImportExportSupportCaseSummaryWorkflowJob"
    | "runNotificationCenterEmailDigestWorkflowJob"
    | "runWebhookOutboundDeliveryWorkflowJob"
    | "runTenantInvitationReminderWorkflowJob"
    | "runTenantInvitationExpiryNotificationWorkflowJob";
  readonly cause: unknown;
  readonly status?: number;
  readonly body?: string;
};

export type ConvexWorkflowExecutionError =
  | ParseResult.ParseError
  | KeycloakAdapterRequestError
  | KeycloakPasswordGrantIdTokenMissingError
  | ConvexAdapterRequestError;

export type ConvexAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.convex;
  readonly deploymentUrl: string;
  readonly siteUrl: string;
  readonly healthcheck: Effect.Effect<
    ConvexHealthcheck,
    ConvexRuntimeHealthcheckError
  >;
  readonly scheduleBillingReconciliationWorkflowJob: (
    input: BillingReconciliationWorkflowDispatchInput,
  ) => Effect.Effect<
    ConvexScheduledWorkflowDispatch,
    ConvexWorkflowExecutionError
  >;
};

export type AuthenticatedConvexWorkflowClient = {
  readonly scheduleBillingReconciliationWorkflowJob: (
    input: BillingReconciliationWorkflowDispatchInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<
    ConvexScheduledWorkflowDispatch,
    ConvexWorkflowExecutionError
  >;
  readonly scheduleSearchTenantIndexEnsureWorkflowJob: (
    input: SearchTenantIndexEnsureWorkflowDispatchInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<
    ConvexScheduledWorkflowDispatch,
    ConvexWorkflowExecutionError
  >;
  readonly scheduleImportExportManagedFileSummaryWorkflowJob: (
    input: ImportExportManagedFileSummaryWorkflowDispatchInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<
    ConvexScheduledWorkflowDispatch,
    ConvexWorkflowExecutionError
  >;
  readonly scheduleImportExportSupportCaseSummaryWorkflowJob: (
    input: ImportExportSupportCaseSummaryWorkflowDispatchInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<
    ConvexScheduledWorkflowDispatch,
    ConvexWorkflowExecutionError
  >;
  readonly scheduleNotificationCenterEmailDigestWorkflowJob?: (
    input: NotificationCenterEmailDigestWorkflowDispatchInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<
    ConvexScheduledWorkflowDispatch,
    ConvexWorkflowExecutionError
  >;
  readonly scheduleWebhookOutboundDeliveryWorkflowJob: (
    input: WebhookOutboundDeliveryWorkflowDispatchInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<
    ConvexScheduledWorkflowDispatch,
    ConvexWorkflowExecutionError
  >;
  readonly scheduleTenantInvitationReminderWorkflowJob: (
    input: TenantInvitationReminderWorkflowDispatchInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<
    ConvexScheduledWorkflowDispatch,
    ConvexWorkflowExecutionError
  >;
  readonly scheduleTenantInvitationExpiryNotificationWorkflowJob: (
    input: TenantInvitationExpiryNotificationWorkflowDispatchInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<
    ConvexScheduledWorkflowDispatch,
    ConvexWorkflowExecutionError
  >;
  readonly cancelScheduledWorkflowJob: (
    input: CancelScheduledWorkflowJobInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<null, ConvexWorkflowExecutionError>;
  readonly runBillingConvergenceJob: (
    input: BillingConvergenceWorkflowJobExecutionInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<null, ConvexWorkflowExecutionError>;
  readonly recoverBillingConvergenceJob: (
    input: BillingConvergenceWorkflowJobExecutionInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<null, ConvexWorkflowExecutionError>;
  readonly runDueBillingConvergenceJobs: (
    input?: BillingConvergenceWorkflowJobRunInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<WorkflowJobSummaryList, ConvexWorkflowExecutionError>;
  readonly runSearchTenantIndexEnsureWorkflowJob: (
    input: SearchTenantIndexEnsureWorkflowJobExecutionInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<null, ConvexWorkflowExecutionError>;
  readonly runImportExportManagedFileSummaryWorkflowJob: (
    input: ImportExportManagedFileSummaryWorkflowJobExecutionInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<null, ConvexWorkflowExecutionError>;
  readonly runImportExportSupportCaseSummaryWorkflowJob: (
    input: ImportExportSupportCaseSummaryWorkflowJobExecutionInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<null, ConvexWorkflowExecutionError>;
  readonly runNotificationCenterEmailDigestWorkflowJob?: (
    input: NotificationCenterEmailDigestWorkflowJobExecutionInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<null, ConvexWorkflowExecutionError>;
  readonly runWebhookOutboundDeliveryWorkflowJob: (
    input: WebhookOutboundDeliveryWorkflowJobExecutionInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<null, ConvexWorkflowExecutionError>;
  readonly runTenantInvitationReminderWorkflowJob: (
    input: TenantInvitationReminderWorkflowJobExecutionInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<null, ConvexWorkflowExecutionError>;
  readonly runTenantInvitationExpiryNotificationWorkflowJob: (
    input: TenantInvitationExpiryNotificationWorkflowJobExecutionInput,
    options?: ConvexAuthenticatedRequestOptions,
  ) => Effect.Effect<null, ConvexWorkflowExecutionError>;
};

export class ConvexAdapter extends Context.Tag("ConvexAdapter")<
  ConvexAdapter,
  ConvexAdapterService
>() {}

type ConvexAuthenticatedHttpClient = ConvexHttpClient & {
  readonly setAdminAuth: (
    token: string,
    actingUser: Record<string, string>,
  ) => void;
  readonly setAuth: (token: string) => void;
  readonly setDebug: (enabled: boolean) => void;
};

type ConvexRequestAuth =
  | {
      readonly mode: "admin";
      readonly token: string;
      readonly actingUser: Record<string, string>;
    }
  | {
      readonly mode: "user";
      readonly token: string;
    };

const ConvexOperatorActingIdentityTokenClaimsSchema = Schema.Struct({
  sub: Schema.NonEmptyString,
  iss: Schema.NonEmptyString,
  [identityClaimKey.actorType]: Schema.NonEmptyString,
  preferred_username: Schema.optional(Schema.NonEmptyString),
  jti: Schema.optional(Schema.NonEmptyString),
});

const decodeConvexOperatorActingIdentityTokenClaims = (token: string) =>
  Effect.try({
    try: () => {
      const [, payloadSegment] = token.split(".");

      if (payloadSegment === undefined) {
        throw new Error("JWT payload segment is missing.");
      }

      return JSON.parse(
        Buffer.from(payloadSegment, "base64url").toString("utf8"),
      );
    },
    catch: (cause) => cause,
  }).pipe(
    Effect.flatMap((payload) =>
      Schema.decodeUnknown(ConvexOperatorActingIdentityTokenClaimsSchema)(
        payload,
      ),
    ),
  );

const buildConvexAdminActingIdentityFromUserToken = (token: string) =>
  decodeConvexOperatorActingIdentityTokenClaims(token).pipe(
    Effect.map((claims) => ({
      subject: claims.sub,
      issuer: claims.iss,
      [identityClaimKey.actorType]: claims[identityClaimKey.actorType],
      ...(claims.preferred_username !== undefined
        ? { preferredUsername: claims.preferred_username }
        : {}),
      ...(claims.jti !== undefined ? { tokenIdentifier: claims.jti } : {}),
    })),
  );

const scheduleBillingReconciliationWorkflowJobMutation = makeFunctionReference<
  "mutation",
  BillingReconciliationWorkflowDispatchInput,
  ConvexScheduledWorkflowDispatch
>("workflowJobs:scheduleBillingReconciliationWorkflowJob");

const scheduleSearchTenantIndexEnsureWorkflowJobMutation =
  makeFunctionReference<
    "mutation",
    SearchTenantIndexEnsureWorkflowDispatchInput,
    ConvexScheduledWorkflowDispatch
  >("workflowJobs:scheduleSearchTenantIndexEnsureWorkflowJob");

const scheduleImportExportManagedFileSummaryWorkflowJobMutation =
  makeFunctionReference<
    "mutation",
    ImportExportManagedFileSummaryWorkflowDispatchInput,
    ConvexScheduledWorkflowDispatch
  >("workflowJobs:scheduleImportExportManagedFileSummaryWorkflowJob");

const scheduleImportExportSupportCaseSummaryWorkflowJobMutation =
  makeFunctionReference<
    "mutation",
    ImportExportSupportCaseSummaryWorkflowDispatchInput,
    ConvexScheduledWorkflowDispatch
  >("workflowJobs:scheduleImportExportSupportCaseSummaryWorkflowJob");

const scheduleNotificationCenterEmailDigestWorkflowJobMutation =
  makeFunctionReference<
    "mutation",
    NotificationCenterEmailDigestWorkflowDispatchInput,
    ConvexScheduledWorkflowDispatch
  >("workflowJobs:scheduleNotificationCenterEmailDigestWorkflowJob");

const scheduleWebhookOutboundDeliveryWorkflowJobMutation =
  makeFunctionReference<
    "mutation",
    WebhookOutboundDeliveryWorkflowDispatchInput,
    ConvexScheduledWorkflowDispatch
  >("workflowJobs:scheduleWebhookOutboundDeliveryWorkflowJob");

const scheduleTenantInvitationReminderWorkflowJobMutation =
  makeFunctionReference<
    "mutation",
    TenantInvitationReminderWorkflowDispatchInput,
    ConvexScheduledWorkflowDispatch
  >("workflowJobs:scheduleTenantInvitationReminderWorkflowJob");

const scheduleTenantInvitationExpiryNotificationWorkflowJobMutation =
  makeFunctionReference<
    "mutation",
    TenantInvitationExpiryNotificationWorkflowDispatchInput,
    ConvexScheduledWorkflowDispatch
  >("workflowJobs:scheduleTenantInvitationExpiryNotificationWorkflowJob");

const cancelScheduledWorkflowJobMutation = makeFunctionReference<
  "mutation",
  CancelScheduledWorkflowJobInput,
  null
>("workflowJobs:cancelScheduledWorkflowJob");

const runBillingConvergenceJobAction = makeFunctionReference<
  "action",
  BillingConvergenceWorkflowJobExecutionInput,
  null
>("workflowJobRunner:runBillingConvergenceJob");

const recoverBillingConvergenceJobAction = makeFunctionReference<
  "action",
  BillingConvergenceWorkflowJobExecutionInput,
  null
>("workflowJobRunner:recoverBillingConvergenceJob");

const runDueBillingConvergenceJobsAction = makeFunctionReference<
  "action",
  BillingConvergenceWorkflowJobRunInput,
  WorkflowJobSummaryList
>("workflowJobRunner:runDueBillingConvergenceJobs");

const runSearchTenantIndexEnsureWorkflowJobAction = makeFunctionReference<
  "action",
  SearchTenantIndexEnsureWorkflowJobExecutionInput,
  null
>("workflowJobRunner:runSearchTenantIndexEnsureWorkflowJob");

const runImportExportManagedFileSummaryWorkflowJobAction =
  makeFunctionReference<
    "action",
    ImportExportManagedFileSummaryWorkflowJobExecutionInput,
    null
  >("workflowJobRunner:runImportExportManagedFileSummaryWorkflowJob");

const runImportExportSupportCaseSummaryWorkflowJobAction =
  makeFunctionReference<
    "action",
    ImportExportSupportCaseSummaryWorkflowJobExecutionInput,
    null
  >("workflowJobRunner:runImportExportSupportCaseSummaryWorkflowJob");

const runNotificationCenterEmailDigestWorkflowJobAction = makeFunctionReference<
  "action",
  NotificationCenterEmailDigestWorkflowJobExecutionInput,
  null
>("workflowJobRunner:runNotificationCenterEmailDigestWorkflowJob");

const runWebhookOutboundDeliveryWorkflowJobAction = makeFunctionReference<
  "action",
  WebhookOutboundDeliveryWorkflowJobExecutionInput,
  null
>("workflowJobRunner:runWebhookOutboundDeliveryWorkflowJob");

const runTenantInvitationReminderWorkflowJobAction = makeFunctionReference<
  "action",
  TenantInvitationReminderWorkflowJobExecutionInput,
  null
>("workflowJobRunner:runTenantInvitationReminderWorkflowJob");

const runTenantInvitationExpiryNotificationWorkflowJobAction =
  makeFunctionReference<
    "action",
    TenantInvitationExpiryNotificationWorkflowJobExecutionInput,
    null
  >("workflowJobRunner:runTenantInvitationExpiryNotificationWorkflowJob");

const decodeAuthenticatedRequestOptions = Schema.decodeUnknown(
  ConvexAuthenticatedRequestOptionsSchema,
);

const decodeRunBillingConvergenceJobInput = Schema.decodeUnknown(
  BillingConvergenceWorkflowJobExecutionInputSchema,
);

const decodeCancelScheduledWorkflowJobInput = Schema.decodeUnknown(
  CancelScheduledWorkflowJobInputSchema,
);

const decodeRunDueBillingConvergenceJobsInput = Schema.decodeUnknown(
  BillingConvergenceWorkflowJobRunInputSchema,
);

const decodeWorkflowJobSummaryList = Schema.decodeUnknown(
  WorkflowJobSummaryListSchema,
);

const buildConvexAdapterRequestError = (
  operation: ConvexAdapterRequestError["operation"],
  cause: unknown,
): ConvexAdapterRequestError =>
  ({
    _tag: "ConvexAdapterRequestError",
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
  }) satisfies ConvexAdapterRequestError;

const createConvexHttpClient = (deploymentUrl: string) => {
  const convex = new ConvexHttpClient(deploymentUrl, {
    logger: false,
    skipConvexDeploymentUrlCheck: true,
  }) as ConvexAuthenticatedHttpClient;

  convex.setDebug(false);

  return convex;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const buildConvexAdminActingIdentity = (options: ConvexAdapterOptions) => ({
  subject: options.keycloakConvexServiceActorUsername,
  issuer: `${trimTrailingSlash(options.keycloakBaseUrl)}/realms/${options.keycloakRealm}`,
  preferredUsername: options.keycloakConvexServiceActorUsername,
  [identityClaimKey.actorType]: actorType.serviceActor,
});

export const makeAuthenticatedConvexWorkflowClient = (
  input: ConvexAdapterOptions,
) =>
  Schema.decodeUnknown(ConvexAdapterOptionsSchema)(input).pipe(
    Effect.flatMap((options) =>
      makeKeycloakAdapter({
        baseUrl: options.keycloakBaseUrl,
        realm: options.keycloakRealm,
        clientId: options.keycloakClientId,
        clientSecret: options.keycloakClientSecret,
      }).pipe(
        Effect.map((keycloak): AuthenticatedConvexWorkflowClient => {
          const resolveRequestAuth = (
            requestOptions?: ConvexAuthenticatedRequestOptions,
          ) =>
            decodeAuthenticatedRequestOptions(requestOptions ?? {}).pipe(
              Effect.flatMap((decodedOptions) => {
                const authToken = decodedOptions.authToken;

                return authToken !== undefined
                  ? options.adminKey !== undefined
                    ? buildConvexAdminActingIdentityFromUserToken(
                        authToken,
                      ).pipe(
                        Effect.map(
                          (actingUser): ConvexRequestAuth => ({
                            mode: "admin",
                            token: options.adminKey!,
                            actingUser,
                          }),
                        ),
                        // When token claims cannot be decoded locally, fall back to
                        // the original user-auth path instead of masking the request.
                        Effect.orElseSucceed(
                          (): ConvexRequestAuth => ({
                            mode: "user",
                            token: authToken,
                          }),
                        ),
                      )
                    : Effect.succeed({
                        mode: "user",
                        token: authToken,
                      } satisfies ConvexRequestAuth)
                  : options.adminKey !== undefined
                    ? Effect.succeed({
                        mode: "admin",
                        token: options.adminKey,
                        actingUser: buildConvexAdminActingIdentity(options),
                      } satisfies ConvexRequestAuth)
                    : keycloak
                        .issueIdTokenWithPasswordGrant({
                          username: options.keycloakConvexServiceActorUsername,
                          password: options.keycloakConvexServiceActorPassword,
                        })
                        .pipe(
                          Effect.map(
                            (token): ConvexRequestAuth => ({
                              mode: "user",
                              token,
                            }),
                          ),
                        );
              }),
            );

          const invokeAuthenticatedRequest = <A>(request: {
            readonly operation: ConvexAdapterRequestError["operation"];
            readonly authOptions?: ConvexAuthenticatedRequestOptions;
            readonly invoke: (
              client: ConvexAuthenticatedHttpClient,
            ) => Promise<A>;
          }) =>
            resolveRequestAuth(request.authOptions).pipe(
              Effect.flatMap((requestAuth) =>
                Effect.tryPromise({
                  try: async () => {
                    const convex = createConvexHttpClient(
                      options.deploymentUrl,
                    );

                    if (requestAuth.mode === "admin") {
                      convex.setAdminAuth(
                        requestAuth.token,
                        requestAuth.actingUser,
                      );
                    } else {
                      convex.setAuth(requestAuth.token);
                    }

                    return await request.invoke(convex);
                  },
                  catch: (cause) =>
                    buildConvexAdapterRequestError(request.operation, cause),
                }),
              ),
            );

          return {
            scheduleBillingReconciliationWorkflowJob: (input, requestOptions) =>
              Schema.decodeUnknown(
                BillingReconciliationWorkflowDispatchInputSchema,
              )(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "scheduleBillingReconciliationWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.mutation(
                        scheduleBillingReconciliationWorkflowJobMutation,
                        request,
                        { skipQueue: true },
                      ),
                  }),
                ),
                Effect.flatMap((payload) =>
                  decodeConvexScheduledWorkflowDispatch(payload),
                ),
              ),
            scheduleSearchTenantIndexEnsureWorkflowJob: (
              input,
              requestOptions,
            ) =>
              Schema.decodeUnknown(
                SearchTenantIndexEnsureWorkflowDispatchInputSchema,
              )(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "scheduleSearchTenantIndexEnsureWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.mutation(
                        scheduleSearchTenantIndexEnsureWorkflowJobMutation,
                        request,
                        { skipQueue: true },
                      ),
                  }),
                ),
                Effect.flatMap((payload) =>
                  decodeConvexScheduledWorkflowDispatch(payload),
                ),
              ),
            scheduleImportExportManagedFileSummaryWorkflowJob: (
              input,
              requestOptions,
            ) =>
              Schema.decodeUnknown(
                ImportExportManagedFileSummaryWorkflowDispatchInputSchema,
              )(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation:
                      "scheduleImportExportManagedFileSummaryWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.mutation(
                        scheduleImportExportManagedFileSummaryWorkflowJobMutation,
                        request,
                        { skipQueue: true },
                      ),
                  }),
                ),
                Effect.flatMap((payload) =>
                  decodeConvexScheduledWorkflowDispatch(payload),
                ),
              ),
            scheduleImportExportSupportCaseSummaryWorkflowJob: (
              input,
              requestOptions,
            ) =>
              Schema.decodeUnknown(
                ImportExportSupportCaseSummaryWorkflowDispatchInputSchema,
              )(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation:
                      "scheduleImportExportSupportCaseSummaryWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.mutation(
                        scheduleImportExportSupportCaseSummaryWorkflowJobMutation,
                        request,
                        { skipQueue: true },
                      ),
                  }),
                ),
                Effect.flatMap((payload) =>
                  decodeConvexScheduledWorkflowDispatch(payload),
                ),
              ),
            scheduleNotificationCenterEmailDigestWorkflowJob: (
              input,
              requestOptions,
            ) =>
              Schema.decodeUnknown(
                NotificationCenterEmailDigestWorkflowDispatchInputSchema,
              )(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation:
                      "scheduleNotificationCenterEmailDigestWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.mutation(
                        scheduleNotificationCenterEmailDigestWorkflowJobMutation,
                        request,
                        { skipQueue: true },
                      ),
                  }),
                ),
                Effect.flatMap((payload) =>
                  decodeConvexScheduledWorkflowDispatch(payload),
                ),
              ),
            scheduleWebhookOutboundDeliveryWorkflowJob: (
              input,
              requestOptions,
            ) =>
              Schema.decodeUnknown(
                WebhookOutboundDeliveryWorkflowDispatchInputSchema,
              )(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "scheduleWebhookOutboundDeliveryWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.mutation(
                        scheduleWebhookOutboundDeliveryWorkflowJobMutation,
                        request,
                        { skipQueue: true },
                      ),
                  }),
                ),
                Effect.flatMap((payload) =>
                  decodeConvexScheduledWorkflowDispatch(payload),
                ),
              ),
            scheduleTenantInvitationReminderWorkflowJob: (
              input,
              requestOptions,
            ) =>
              Schema.decodeUnknown(
                TenantInvitationReminderWorkflowDispatchInputSchema,
              )(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "scheduleTenantInvitationReminderWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.mutation(
                        scheduleTenantInvitationReminderWorkflowJobMutation,
                        request,
                        { skipQueue: true },
                      ),
                  }),
                ),
                Effect.flatMap((payload) =>
                  decodeConvexScheduledWorkflowDispatch(payload),
                ),
              ),
            scheduleTenantInvitationExpiryNotificationWorkflowJob: (
              input,
              requestOptions,
            ) =>
              Schema.decodeUnknown(
                TenantInvitationExpiryNotificationWorkflowDispatchInputSchema,
              )(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation:
                      "scheduleTenantInvitationExpiryNotificationWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.mutation(
                        scheduleTenantInvitationExpiryNotificationWorkflowJobMutation,
                        request,
                        { skipQueue: true },
                      ),
                  }),
                ),
                Effect.flatMap((payload) =>
                  decodeConvexScheduledWorkflowDispatch(payload),
                ),
              ),
            cancelScheduledWorkflowJob: (input, requestOptions) =>
              decodeCancelScheduledWorkflowJobInput(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "cancelScheduledWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.mutation(
                        cancelScheduledWorkflowJobMutation,
                        request,
                        { skipQueue: true },
                      ),
                  }),
                ),
              ),
            runBillingConvergenceJob: (input, requestOptions) =>
              decodeRunBillingConvergenceJobInput(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "runBillingConvergenceJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.action(
                        runBillingConvergenceJobAction,
                        request,
                      ),
                  }),
                ),
              ),
            recoverBillingConvergenceJob: (input, requestOptions) =>
              decodeRunBillingConvergenceJobInput(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "recoverBillingConvergenceJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.action(
                        recoverBillingConvergenceJobAction,
                        request,
                      ),
                  }),
                ),
              ),
            runDueBillingConvergenceJobs: (input, requestOptions) =>
              decodeRunDueBillingConvergenceJobsInput(input ?? {}).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "runDueBillingConvergenceJobs",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.action(
                        runDueBillingConvergenceJobsAction,
                        request,
                      ),
                  }),
                ),
                Effect.flatMap((payload) =>
                  decodeWorkflowJobSummaryList(payload),
                ),
              ),
            runSearchTenantIndexEnsureWorkflowJob: (input, requestOptions) =>
              Schema.decodeUnknown(
                SearchTenantIndexEnsureWorkflowJobExecutionInputSchema,
              )(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "runSearchTenantIndexEnsureWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.action(
                        runSearchTenantIndexEnsureWorkflowJobAction,
                        request,
                      ),
                  }),
                ),
              ),
            runImportExportManagedFileSummaryWorkflowJob: (
              input,
              requestOptions,
            ) =>
              Schema.decodeUnknown(
                ImportExportManagedFileSummaryWorkflowJobExecutionInputSchema,
              )(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "runImportExportManagedFileSummaryWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.action(
                        runImportExportManagedFileSummaryWorkflowJobAction,
                        request,
                      ),
                  }),
                ),
              ),
            runImportExportSupportCaseSummaryWorkflowJob: (
              input,
              requestOptions,
            ) =>
              Schema.decodeUnknown(
                ImportExportSupportCaseSummaryWorkflowJobExecutionInputSchema,
              )(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "runImportExportSupportCaseSummaryWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.action(
                        runImportExportSupportCaseSummaryWorkflowJobAction,
                        request,
                      ),
                  }),
                ),
              ),
            runNotificationCenterEmailDigestWorkflowJob: (
              input,
              requestOptions,
            ) =>
              Schema.decodeUnknown(
                NotificationCenterEmailDigestWorkflowJobExecutionInputSchema,
              )(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "runNotificationCenterEmailDigestWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.action(
                        runNotificationCenterEmailDigestWorkflowJobAction,
                        request,
                      ),
                  }),
                ),
              ),
            runWebhookOutboundDeliveryWorkflowJob: (input, requestOptions) =>
              Schema.decodeUnknown(
                WebhookOutboundDeliveryWorkflowJobExecutionInputSchema,
              )(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "runWebhookOutboundDeliveryWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.action(
                        runWebhookOutboundDeliveryWorkflowJobAction,
                        request,
                      ),
                  }),
                ),
              ),
            runTenantInvitationReminderWorkflowJob: (input, requestOptions) =>
              Schema.decodeUnknown(
                TenantInvitationReminderWorkflowJobExecutionInputSchema,
              )(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "runTenantInvitationReminderWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.action(
                        runTenantInvitationReminderWorkflowJobAction,
                        request,
                      ),
                  }),
                ),
              ),
            runTenantInvitationExpiryNotificationWorkflowJob: (
              input,
              requestOptions,
            ) =>
              Schema.decodeUnknown(
                TenantInvitationExpiryNotificationWorkflowJobExecutionInputSchema,
              )(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation:
                      "runTenantInvitationExpiryNotificationWorkflowJob",
                    ...(requestOptions !== undefined
                      ? { authOptions: requestOptions }
                      : {}),
                    invoke: async (convex) =>
                      await convex.action(
                        runTenantInvitationExpiryNotificationWorkflowJobAction,
                        request,
                      ),
                  }),
                ),
              ),
          };
        }),
      ),
    ),
  );

export const makeConvexAdapter = (input: ConvexAdapterOptions) =>
  makeAuthenticatedConvexWorkflowClient(input).pipe(
    Effect.map(
      (workflowClient): ConvexAdapterService => ({
        serviceName: platformAdapterServiceName.convex,
        deploymentUrl: input.deploymentUrl,
        siteUrl: input.siteUrl,
        healthcheck: createConvexRuntimeHealthcheck({
          deploymentUrl: input.deploymentUrl,
          fetchImplementation: input.fetch ?? fetch,
        }),
        scheduleBillingReconciliationWorkflowJob: (request) =>
          workflowClient.scheduleBillingReconciliationWorkflowJob(request),
      }),
    ),
  );

export const makeConvexAdapterLayer = (options: ConvexAdapterOptions) =>
  Layer.effect(ConvexAdapter, makeConvexAdapter(options));
