import { spawnSync } from "child_process";

const runBackendApiNotificationCenterProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import { subscriberJourneySessionHeaderName } from '@comvestec/platform';
import { createBackendApiApp } from '@comvestec/platform/http';
import { createBackendApiOpenApiDocument } from './packages/platform/src/http/openapi-document.ts';
import { adminNotificationCenterApiBasePath, adminNotificationCenterApiPath } from './packages/platform/src/services/communication/admin-notification-center-http.ts';

const document = createBackendApiOpenApiDocument('http://localhost');
const staticHandler = () => Response.json({ acknowledged: true });
const notificationCenterHandler = () => Response.json({ route: 'notification-center' });
const app = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminNotificationCenterHandler: notificationCenterHandler,
  adminGovernanceHandler: staticHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  fileStorageHandler: staticHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
});
const missingNotificationCenterApp = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: staticHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  fileStorageHandler: staticHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
});
const receiptRouteResponse = await app.request(
  new Request('http://localhost' + adminNotificationCenterApiPath.inspectEmailReceipt, {
    method: 'POST',
  }),
);
const inspectInAppRouteResponse = await app.request(
  new Request('http://localhost' + adminNotificationCenterApiPath.inspectInAppNotification, {
    method: 'POST',
  }),
);
const inspectPreferenceRouteResponse = await app.request(
  new Request('http://localhost' + adminNotificationCenterApiPath.inspectEmailPreference, {
    method: 'POST',
  }),
);
const upsertPreferenceRouteResponse = await app.request(
  new Request('http://localhost' + adminNotificationCenterApiPath.upsertEmailPreference, {
    method: 'POST',
  }),
);
const missingRouteResponse = await missingNotificationCenterApp.request(
  new Request('http://localhost' + adminNotificationCenterApiPath.inspectEmailReceipt, {
    method: 'POST',
  }),
);
console.log(JSON.stringify({
  receiptRequestRef: document.paths[adminNotificationCenterApiPath.inspectEmailReceipt]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  receiptResponseRef: document.paths[adminNotificationCenterApiPath.inspectEmailReceipt]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  receiptResponse403Description: document.paths[adminNotificationCenterApiPath.inspectEmailReceipt]?.post?.responses?.['403']?.description,
  inAppRequestRef: document.paths[adminNotificationCenterApiPath.inspectInAppNotification]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  inAppResponseRef: document.paths[adminNotificationCenterApiPath.inspectInAppNotification]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  inspectPreferenceRequestRef: document.paths[adminNotificationCenterApiPath.inspectEmailPreference]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  inspectPreferenceResponseRef: document.paths[adminNotificationCenterApiPath.inspectEmailPreference]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  upsertPreferenceRequestRef: document.paths[adminNotificationCenterApiPath.upsertEmailPreference]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  upsertPreferenceResponseRef: document.paths[adminNotificationCenterApiPath.upsertEmailPreference]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  parameterNamesByPath: {
    receipt: (document.paths[adminNotificationCenterApiPath.inspectEmailReceipt]?.post?.parameters ?? []).map((parameter) => parameter.name),
    inApp: (document.paths[adminNotificationCenterApiPath.inspectInAppNotification]?.post?.parameters ?? []).map((parameter) => parameter.name),
    inspectPreference: (document.paths[adminNotificationCenterApiPath.inspectEmailPreference]?.post?.parameters ?? []).map((parameter) => parameter.name),
    upsertPreference: (document.paths[adminNotificationCenterApiPath.upsertEmailPreference]?.post?.parameters ?? []).map((parameter) => parameter.name),
  },
  routeStatus: receiptRouteResponse.status,
  routeBody: await receiptRouteResponse.json(),
  inspectInAppRouteStatus: inspectInAppRouteResponse.status,
  inspectInAppRouteBody: await inspectInAppRouteResponse.json(),
  inspectPreferenceRouteStatus: inspectPreferenceRouteResponse.status,
  inspectPreferenceRouteBody: await inspectPreferenceRouteResponse.json(),
  upsertPreferenceRouteStatus: upsertPreferenceRouteResponse.status,
  upsertPreferenceRouteBody: await upsertPreferenceRouteResponse.json(),
  missingRouteStatus: missingRouteResponse.status,
  missingRouteBody: await missingRouteResponse.json(),
  subscriberJourneySessionHeaderName,
  apiBasePath: adminNotificationCenterApiBasePath,
}));`,
    ],
    {
      cwd: process.cwd(),
      timeout: 90_000,
    },
  );

  if (proc.status !== 0) {
    throw new Error(
      `Bun runtime probe failed:\n${(proc.stderr ?? "").toString()}`,
    );
  }

  return JSON.parse((proc.stdout ?? "").toString()) as {
    readonly receiptRequestRef?: string;
    readonly receiptResponseRef?: string;
    readonly receiptResponse403Description?: string;
    readonly inAppRequestRef?: string;
    readonly inAppResponseRef?: string;
    readonly inspectPreferenceRequestRef?: string;
    readonly inspectPreferenceResponseRef?: string;
    readonly upsertPreferenceRequestRef?: string;
    readonly upsertPreferenceResponseRef?: string;
    readonly parameterNamesByPath: {
      readonly receipt: readonly string[];
      readonly inApp: readonly string[];
      readonly inspectPreference: readonly string[];
      readonly upsertPreference: readonly string[];
    };
    readonly routeStatus: number;
    readonly routeBody: {
      readonly route: string;
    };
    readonly inspectInAppRouteStatus: number;
    readonly inspectInAppRouteBody: {
      readonly route: string;
    };
    readonly inspectPreferenceRouteStatus: number;
    readonly inspectPreferenceRouteBody: {
      readonly route: string;
    };
    readonly upsertPreferenceRouteStatus: number;
    readonly upsertPreferenceRouteBody: {
      readonly route: string;
    };
    readonly missingRouteStatus: number;
    readonly missingRouteBody: {
      readonly error: string;
    };
    readonly subscriberJourneySessionHeaderName: string;
    readonly apiBasePath: string;
  };
};

describe("platform backend api notification-center transport", () => {
  it("documents and mounts the admin notification-center route", () => {
    const probe = runBackendApiNotificationCenterProbe();

    expect(probe.apiBasePath).toBe(
      "/api/admin/communication/notification-center",
    );
    expect(probe.receiptRequestRef).toBe(
      "#/components/schemas/InspectNotificationCenterEmailReceiptBySessionRequest",
    );
    expect(probe.receiptResponseRef).toBe(
      "#/components/schemas/NotificationCenterEmailReceiptAdminView",
    );
    expect(probe.receiptResponse403Description).toBe(
      "Notification-center inspection is not allowed for this session.",
    );
    expect(probe.inAppRequestRef).toBe(
      "#/components/schemas/InspectNotificationCenterInAppNotificationBySessionRequest",
    );
    expect(probe.inAppResponseRef).toBe(
      "#/components/schemas/NotificationCenterInAppNotificationAdminView",
    );
    expect(probe.inspectPreferenceRequestRef).toBe(
      "#/components/schemas/InspectNotificationCenterEmailPreferenceBySessionRequest",
    );
    expect(probe.inspectPreferenceResponseRef).toBe(
      "#/components/schemas/NotificationCenterEmailPreferenceAdminView",
    );
    expect(probe.upsertPreferenceRequestRef).toBe(
      "#/components/schemas/UpsertNotificationCenterEmailPreferenceBySessionRequest",
    );
    expect(probe.upsertPreferenceResponseRef).toBe(
      "#/components/schemas/NotificationCenterEmailPreferenceAdminView",
    );
    expect(Object.values(probe.parameterNamesByPath)).toEqual([
      [probe.subscriberJourneySessionHeaderName],
      [probe.subscriberJourneySessionHeaderName],
      [probe.subscriberJourneySessionHeaderName],
      [probe.subscriberJourneySessionHeaderName],
    ]);
    expect(probe.routeStatus).toBe(200);
    expect(probe.routeBody).toEqual({ route: "notification-center" });
    expect(probe.inspectInAppRouteStatus).toBe(200);
    expect(probe.inspectInAppRouteBody).toEqual({
      route: "notification-center",
    });
    expect(probe.inspectPreferenceRouteStatus).toBe(200);
    expect(probe.inspectPreferenceRouteBody).toEqual({
      route: "notification-center",
    });
    expect(probe.upsertPreferenceRouteStatus).toBe(200);
    expect(probe.upsertPreferenceRouteBody).toEqual({
      route: "notification-center",
    });
    expect(probe.missingRouteStatus).toBe(404);
    expect(probe.missingRouteBody).toEqual({
      error: "Admin notification center route not found.",
    });
  }, 90_000);
});
