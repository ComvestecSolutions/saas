import { spawnSync } from "child_process";

const runBackendApiEmailDeliveryProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import { subscriberJourneySessionHeaderName } from '@comvestec/platform';
import { createBackendApiApp } from '@comvestec/platform/http';
import { createBackendApiOpenApiDocument } from './packages/platform/src/http/openapi-document.ts';
import { adminEmailDeliveryApiBasePath, adminEmailDeliveryApiPath } from './packages/platform/src/services/communication/admin-email-delivery-http.ts';
import { emailDeliveryApiBasePath, emailDeliveryApiPath } from './packages/platform/src/services/communication/email-delivery-http.ts';

const document = createBackendApiOpenApiDocument('http://localhost');
const staticHandler = () => Response.json({ acknowledged: true });
const emailDeliveryHandler = () => Response.json({ route: 'email-delivery' });
const providerEventsHandler = () => Response.json({ route: 'email-delivery-provider-events' });
const app = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminEmailDeliveryHandler: emailDeliveryHandler,
  emailDeliveryHandler: providerEventsHandler,
  adminGovernanceHandler: staticHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  fileStorageHandler: staticHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
});
const missingEmailDeliveryApp = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: staticHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  fileStorageHandler: staticHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
});
const trackingRouteResponse = await app.request(
  new Request('http://localhost' + adminEmailDeliveryApiPath.inspectTracking, {
    method: 'POST',
  }),
);
const providerRouteResponse = await app.request(
  new Request('http://localhost' + emailDeliveryApiPath.processPostalProviderEvent, {
    method: 'POST',
  }),
);
const missingRouteResponse = await missingEmailDeliveryApp.request(
  new Request('http://localhost' + adminEmailDeliveryApiPath.inspectTracking, {
    method: 'POST',
  }),
);
const missingProviderRouteResponse = await missingEmailDeliveryApp.request(
  new Request('http://localhost' + emailDeliveryApiPath.processPostalProviderEvent, {
    method: 'POST',
  }),
);
console.log(JSON.stringify({
  trackingRequestRef: document.paths[adminEmailDeliveryApiPath.inspectTracking]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  trackingResponseRef: document.paths[adminEmailDeliveryApiPath.inspectTracking]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  tracking403Description: document.paths[adminEmailDeliveryApiPath.inspectTracking]?.post?.responses?.['403']?.description,
  suppressionRequestRef: document.paths[adminEmailDeliveryApiPath.inspectRecipientSuppression]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  suppressionResponseRef: document.paths[adminEmailDeliveryApiPath.inspectRecipientSuppression]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  suppression404Description: document.paths[adminEmailDeliveryApiPath.inspectRecipientSuppression]?.post?.responses?.['404']?.description,
  providerEventsRequestRef: document.paths[emailDeliveryApiPath.processPostalProviderEvent]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  providerEventsResponseRef: document.paths[emailDeliveryApiPath.processPostalProviderEvent]?.post?.responses?.['202']?.content?.['application/json']?.schema?.$ref,
  providerEvents401Description: document.paths[emailDeliveryApiPath.processPostalProviderEvent]?.post?.responses?.['401']?.description,
  providerEventsHeaderNames: (document.paths[emailDeliveryApiPath.processPostalProviderEvent]?.post?.parameters ?? []).map((parameter) => parameter.name),
  trackingParameterNames: (document.paths[adminEmailDeliveryApiPath.inspectTracking]?.post?.parameters ?? []).map((parameter) => parameter.name),
  routeStatus: trackingRouteResponse.status,
  routeBody: await trackingRouteResponse.json(),
  providerRouteStatus: providerRouteResponse.status,
  providerRouteBody: await providerRouteResponse.json(),
  missingRouteStatus: missingRouteResponse.status,
  missingRouteBody: await missingRouteResponse.json(),
  missingProviderRouteStatus: missingProviderRouteResponse.status,
  missingProviderRouteBody: await missingProviderRouteResponse.json(),
  subscriberJourneySessionHeaderName,
  apiBasePath: adminEmailDeliveryApiBasePath,
  providerEventsBasePath: emailDeliveryApiBasePath,
}));`,
    ],
    {
      cwd: process.cwd(),
    },
  );

  if (proc.status !== 0) {
    throw new Error(
      `Bun runtime probe failed:\n${(proc.stderr ?? "").toString()}`,
    );
  }

  return JSON.parse((proc.stdout ?? "").toString()) as {
    readonly trackingRequestRef?: string;
    readonly trackingResponseRef?: string;
    readonly tracking403Description?: string;
    readonly suppressionRequestRef?: string;
    readonly suppressionResponseRef?: string;
    readonly suppression404Description?: string;
    readonly providerEventsRequestRef?: string;
    readonly providerEventsResponseRef?: string;
    readonly providerEvents401Description?: string;
    readonly providerEventsHeaderNames: readonly string[];
    readonly trackingParameterNames: readonly string[];
    readonly routeStatus: number;
    readonly routeBody: {
      readonly route: string;
    };
    readonly providerRouteStatus: number;
    readonly providerRouteBody: {
      readonly route: string;
    };
    readonly missingRouteStatus: number;
    readonly missingRouteBody: {
      readonly error: string;
    };
    readonly missingProviderRouteStatus: number;
    readonly missingProviderRouteBody: {
      readonly error: string;
    };
    readonly subscriberJourneySessionHeaderName: string;
    readonly apiBasePath: string;
    readonly providerEventsBasePath: string;
  };
};

describe("platform backend api email delivery transport", () => {
  it("documents and mounts the admin email-delivery routes", () => {
    const probe = runBackendApiEmailDeliveryProbe();

    expect(probe.apiBasePath).toBe("/api/admin/communication/email-delivery");
    expect(probe.providerEventsBasePath).toBe(
      "/api/communication/email-delivery",
    );
    expect(probe.trackingRequestRef).toBe(
      "#/components/schemas/InspectEmailDeliveryTrackingBySessionRequest",
    );
    expect(probe.trackingResponseRef).toBe(
      "#/components/schemas/EmailDeliveryTrackingAdminView",
    );
    expect(probe.tracking403Description).toBe(
      "Email delivery inspection is not allowed for this session.",
    );
    expect(probe.suppressionRequestRef).toBe(
      "#/components/schemas/InspectEmailRecipientSuppressionBySessionRequest",
    );
    expect(probe.suppressionResponseRef).toBe(
      "#/components/schemas/EmailRecipientSuppressionAdminView",
    );
    expect(probe.suppression404Description).toBe(
      "Requested resource was not found.",
    );
    expect(probe.providerEventsRequestRef).toBe(
      "#/components/schemas/RawWebhookPayload",
    );
    expect(probe.providerEventsResponseRef).toBe(
      "#/components/schemas/WebhookIgnoredResponse",
    );
    expect(probe.providerEvents401Description).toBe(
      "Authentication or signature validation failed.",
    );
    expect(probe.providerEventsHeaderNames).toEqual([
      "X-Postal-Signature-256",
      "X-Postal-Signature-KID",
    ]);
    expect(probe.trackingParameterNames).toEqual([
      probe.subscriberJourneySessionHeaderName,
    ]);
    expect(probe.routeStatus).toBe(200);
    expect(probe.routeBody).toEqual({ route: "email-delivery" });
    expect(probe.providerRouteStatus).toBe(200);
    expect(probe.providerRouteBody).toEqual({
      route: "email-delivery-provider-events",
    });
    expect(probe.missingRouteStatus).toBe(404);
    expect(probe.missingRouteBody).toEqual({
      error: "Admin email delivery route not found.",
    });
    expect(probe.missingProviderRouteStatus).toBe(404);
    expect(probe.missingProviderRouteBody).toEqual({
      error: "Email delivery route not found.",
    });
  }, 30_000);
});
