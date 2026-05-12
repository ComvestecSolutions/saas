import { Effect, ParseResult, Schema } from "effect";
import {
  type PermissionScope,
  type PlatformModuleId,
  type RequestContext,
  telemetryKind,
} from "@comvestec/contracts";
import {
  makeObservabilityModule,
  type TelemetryEnvelope,
  type ObservabilityModuleService,
} from "@comvestec/modules";
import {
  makeOpenPanelAdapter,
  type OpenPanelAdapterError,
  type OpenPanelAdapterService,
} from "../../adapters";

const PlatformBusinessEventEnvironmentSchema = Schema.Struct({
  OPENPANEL_API_URL: Schema.NonEmptyString,
  OPENPANEL_CLIENT_ID: Schema.NonEmptyString,
  OPENPANEL_CLIENT_SECRET: Schema.NonEmptyString,
});

const PlatformBusinessEventPropertiesSchema = Schema.Record({
  key: Schema.NonEmptyString,
  value: Schema.Unknown,
});

export type PlatformBusinessEventProperties = Schema.Schema.Type<
  typeof PlatformBusinessEventPropertiesSchema
>;

export const platformBusinessEventName = {
  importExportManagedFileSummaryRequested:
    "import-export.managed-file-summary.requested",
  importExportManagedFileSummaryCompleted:
    "import-export.managed-file-summary.completed",
  importExportSupportCaseSummaryRequested:
    "import-export.support-case-summary.requested",
  importExportSupportCaseSummaryCompleted:
    "import-export.support-case-summary.completed",
  searchManagedFilesQueryPreviewed: "search.managed-files.query-previewed",
  searchSupportCasesQueryPreviewed: "search.support-cases.query-previewed",
  searchCurrentTenantManagedFilesQueryExecuted:
    "search.current-tenant.managed-files.query-executed",
} as const;

export type PlatformBusinessEventName =
  (typeof platformBusinessEventName)[keyof typeof platformBusinessEventName];

export type PlatformBusinessEvent = {
  readonly requestContext: RequestContext;
  readonly moduleId: PlatformModuleId;
  readonly eventName: PlatformBusinessEventName;
  readonly permissionScope?: PermissionScope;
  readonly profileId?: string;
  readonly properties?: PlatformBusinessEventProperties;
};

export type PlatformBusinessEventEmitter = (
  input: PlatformBusinessEvent,
) => Effect.Effect<void>;

type PlatformBusinessEventEmitterOptions = {
  readonly serviceName: string;
  readonly observability: Pick<
    ObservabilityModuleService,
    "buildTelemetryEnvelope"
  >;
  readonly openpanel: Pick<OpenPanelAdapterService, "trackEvent">;
  readonly deploymentVersion?: string;
  readonly configVersion?: string;
};

type PlatformBusinessEventEmitterFromEnvironmentOptions = {
  readonly environment: unknown;
  readonly serviceName: string;
  readonly fetch?: typeof fetch;
  readonly deploymentVersion?: string;
  readonly configVersion?: string;
};

const defaultPlatformBusinessEventDeploymentVersion = "foundation-runtime";
const defaultPlatformBusinessEventConfigVersion = "code-declared";

const reportPlatformBusinessEventRuntimeFailure = (input: {
  readonly serviceName: string;
  readonly cause: unknown;
}) => {
  globalThis.console?.error(
    `[${input.serviceName}] Failed to emit business event.`,
    input.cause,
  );
};

const buildPlatformBusinessEventProperties = (input: {
  readonly requestContext: RequestContext;
  readonly envelope: TelemetryEnvelope;
  readonly extraProperties?: PlatformBusinessEventProperties;
}) => ({
  moduleId: input.envelope.moduleId,
  correlationId: input.envelope.correlationId,
  tenantScope: input.envelope.tenantScope,
  tenantScopeId: input.envelope.tenantScopeId,
  actorType: input.requestContext.actorType,
  deploymentVersion: input.envelope.deploymentVersion,
  configVersion: input.envelope.configVersion,
  impersonationActive: input.requestContext.impersonation !== undefined,
  breakGlassActive: input.requestContext.breakGlass !== undefined,
  actorReasonProvided: input.requestContext.reason !== undefined,
  ...(input.envelope.actorId !== undefined
    ? { actorId: input.envelope.actorId }
    : {}),
  ...(input.envelope.permissionScope !== undefined
    ? { permissionScope: input.envelope.permissionScope }
    : {}),
  ...(input.extraProperties ?? {}),
});

export const noopPlatformBusinessEventEmitter: PlatformBusinessEventEmitter =
  () => Effect.void;

export const createPlatformBusinessEventEmitter = (
  options: PlatformBusinessEventEmitterOptions,
): PlatformBusinessEventEmitter => {
  const deploymentVersion =
    options.deploymentVersion ?? defaultPlatformBusinessEventDeploymentVersion;
  const configVersion =
    options.configVersion ?? defaultPlatformBusinessEventConfigVersion;

  return (input) =>
    options.observability
      .buildTelemetryEnvelope({
        requestContext: input.requestContext,
        moduleId: input.moduleId,
        kind: telemetryKind.businessEvent,
        deploymentVersion,
        configVersion,
        ...(input.permissionScope !== undefined
          ? { permissionScope: input.permissionScope }
          : {}),
      })
      .pipe(
        Effect.flatMap((envelope) =>
          options.openpanel.trackEvent({
            name: input.eventName,
            ...(input.profileId !== undefined
              ? { profileId: input.profileId }
              : input.requestContext.actorId !== undefined
                ? { profileId: input.requestContext.actorId }
                : {}),
            properties: buildPlatformBusinessEventProperties({
              requestContext: input.requestContext,
              envelope,
              ...(input.properties !== undefined
                ? { extraProperties: input.properties }
                : {}),
            }),
          }),
        ),
        Effect.catchAllCause((cause) =>
          Effect.sync(() => {
            reportPlatformBusinessEventRuntimeFailure({
              serviceName: options.serviceName,
              cause,
            });
          }),
        ),
        Effect.asVoid,
      );
};

export const createPlatformBusinessEventEmitterFromEnvironment = (
  options: PlatformBusinessEventEmitterFromEnvironmentOptions,
): Effect.Effect<
  PlatformBusinessEventEmitter,
  ParseResult.ParseError | OpenPanelAdapterError
> =>
  Schema.decodeUnknown(PlatformBusinessEventEnvironmentSchema)(
    options.environment,
  ).pipe(
    Effect.flatMap((environment) =>
      makeOpenPanelAdapter({
        apiUrl: environment.OPENPANEL_API_URL,
        clientId: environment.OPENPANEL_CLIENT_ID,
        clientSecret: environment.OPENPANEL_CLIENT_SECRET,
        ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      }),
    ),
    Effect.flatMap((openpanel) =>
      makeObservabilityModule().pipe(
        Effect.map((observability) =>
          createPlatformBusinessEventEmitter({
            serviceName: options.serviceName,
            observability,
            openpanel,
            ...(options.deploymentVersion !== undefined
              ? { deploymentVersion: options.deploymentVersion }
              : {}),
            ...(options.configVersion !== undefined
              ? { configVersion: options.configVersion }
              : {}),
          }),
        ),
      ),
    ),
  );

export const createOptionalPlatformBusinessEventEmitterFromEnvironment = (
  options: PlatformBusinessEventEmitterFromEnvironmentOptions,
): Effect.Effect<PlatformBusinessEventEmitter, OpenPanelAdapterError> =>
  createPlatformBusinessEventEmitterFromEnvironment(options).pipe(
    Effect.catchAll((error) =>
      error instanceof ParseResult.ParseError
        ? Effect.succeed(noopPlatformBusinessEventEmitter)
        : Effect.fail(error),
    ),
  );
