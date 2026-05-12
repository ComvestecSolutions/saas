import { Effect } from "effect";
import {
  actorType,
  permissionScope,
  platformModuleId,
  platformScope,
  type RequestContext,
  telemetryKind,
} from "@comvestec/contracts";
import type { ObservabilityModuleService } from "@comvestec/modules";
import {
  createPlatformBusinessEventEmitter,
  createPlatformBusinessEventEmitterFromEnvironment,
  createOptionalPlatformBusinessEventEmitterFromEnvironment,
  platformBusinessEventName,
  type OpenPanelAdapterService,
} from "@comvestec/platform";

const platformOperatorRequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_support_1",
  sessionId: "sess_support_1",
  correlationId: "corr_observability_1",
  tenant: {
    scope: platformScope.organization,
    scopeId: "org_1",
    organizationId: "org_1",
  },
  reason: "Investigate tenant issue",
} satisfies RequestContext;

describe("platform observability business events", () => {
  it("builds telemetry-backed OpenPanel business-event payloads", async () => {
    const buildTelemetryEnvelope = vi.fn(
      (
        input: Parameters<
          ObservabilityModuleService["buildTelemetryEnvelope"]
        >[0],
      ) =>
        Effect.succeed({
          moduleId: input.moduleId,
          kind: input.kind,
          correlationId: input.requestContext.correlationId,
          actorId: input.requestContext.actorId,
          tenantScope: input.requestContext.tenant.scope,
          tenantScopeId: input.requestContext.tenant.scopeId,
          ...(input.permissionScope !== undefined
            ? { permissionScope: input.permissionScope }
            : {}),
          deploymentVersion: input.deploymentVersion,
          configVersion: input.configVersion,
        }),
    );
    const trackEvent = vi.fn(
      (input: Parameters<OpenPanelAdapterService["trackEvent"]>[0]) =>
        Effect.succeed(input),
    );
    const emitter = createPlatformBusinessEventEmitter({
      serviceName: "observability-test",
      observability: { buildTelemetryEnvelope },
      openpanel: { trackEvent },
      deploymentVersion: "deployment-1",
      configVersion: "config-1",
    });

    await expect(
      Effect.runPromise(
        emitter({
          requestContext: platformOperatorRequestContext,
          moduleId: platformModuleId.search,
          eventName: platformBusinessEventName.searchManagedFilesQueryPreviewed,
          permissionScope: permissionScope.searchAdmin,
          properties: {
            queryLength: 7,
            resultCount: 1,
          },
        }),
      ),
    ).resolves.toBeUndefined();

    expect(buildTelemetryEnvelope).toHaveBeenCalledWith({
      requestContext: platformOperatorRequestContext,
      moduleId: platformModuleId.search,
      kind: telemetryKind.businessEvent,
      permissionScope: permissionScope.searchAdmin,
      deploymentVersion: "deployment-1",
      configVersion: "config-1",
    });
    expect(trackEvent).toHaveBeenCalledWith({
      name: platformBusinessEventName.searchManagedFilesQueryPreviewed,
      profileId: "usr_support_1",
      properties: {
        moduleId: platformModuleId.search,
        correlationId: "corr_observability_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        actorType: actorType.platformOperator,
        actorId: "usr_support_1",
        permissionScope: permissionScope.searchAdmin,
        deploymentVersion: "deployment-1",
        configVersion: "config-1",
        impersonationActive: false,
        breakGlassActive: false,
        actorReasonProvided: true,
        queryLength: 7,
        resultCount: 1,
      },
    });
  });

  it("creates an authenticated OpenPanel emitter from environment", async () => {
    const requests: Array<{
      readonly url: string;
      readonly method: string;
      readonly headers: Record<string, string>;
      readonly body?: string;
    }> = [];
    const emitter = await Effect.runPromise(
      createPlatformBusinessEventEmitterFromEnvironment({
        serviceName: "observability-test",
        environment: {
          OPENPANEL_API_URL: "http://localhost:3005/api",
          OPENPANEL_CLIENT_ID: "client_demo",
          OPENPANEL_CLIENT_SECRET: "client_secret_demo",
        },
        fetch: async (input, init) => {
          requests.push({
            url: typeof input === "string" ? input : input.toString(),
            method: init?.method ?? "GET",
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
            ...(init?.body != null
              ? {
                  body:
                    typeof init.body === "string"
                      ? init.body
                      : init.body.toString(),
                }
              : {}),
          });

          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        },
      }),
    );

    await expect(
      Effect.runPromise(
        emitter({
          requestContext: platformOperatorRequestContext,
          moduleId: platformModuleId.importExport,
          eventName:
            platformBusinessEventName.importExportManagedFileSummaryRequested,
          permissionScope: permissionScope.exportExecute,
          properties: {
            jobId: "job_import_export_1",
          },
        }),
      ),
    ).resolves.toBeUndefined();

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: "http://localhost:3005/api/track",
      method: "POST",
      headers: expect.objectContaining({
        "openpanel-client-id": "client_demo",
        "openpanel-client-secret": "client_secret_demo",
      }),
    });
    expect(JSON.parse(requests[0]!.body ?? "null")).toMatchObject({
      type: "track",
      payload: {
        name: platformBusinessEventName.importExportManagedFileSummaryRequested,
        profileId: "usr_support_1",
        properties: expect.objectContaining({
          moduleId: platformModuleId.importExport,
          jobId: "job_import_export_1",
        }),
      },
    });
  });

  it("falls back to a noop emitter when OpenPanel environment is absent", async () => {
    const fetchImplementation = vi.fn();
    const emitter = await Effect.runPromise(
      createOptionalPlatformBusinessEventEmitterFromEnvironment({
        serviceName: "observability-test",
        environment: {},
        fetch: fetchImplementation,
      }),
    );

    await expect(
      Effect.runPromise(
        emitter({
          requestContext: platformOperatorRequestContext,
          moduleId: platformModuleId.search,
          eventName: platformBusinessEventName.searchManagedFilesQueryPreviewed,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("fails emitter construction when OpenPanel environment is absent", async () => {
    const fetchImplementation = vi.fn();
    const exit = await Effect.runPromiseExit(
      createPlatformBusinessEventEmitterFromEnvironment({
        serviceName: "observability-test",
        environment: {},
        fetch: fetchImplementation,
      }),
    );

    expect(exit._tag).toBe("Failure");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
