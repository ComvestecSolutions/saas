import { spawnSync } from "child_process";

const runBackendApiWorkflowJobsProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import { subscriberJourneySessionHeaderName } from '@comvestec/platform';
import { createBackendApiApp } from '@comvestec/platform/http';
import { createBackendApiOpenApiDocument } from './packages/platform/src/http/openapi-document.ts';
import { workflowJobsApiBasePath, workflowJobsApiPath } from './packages/platform/src/services/domains/workflow-jobs-http.ts';

const document = createBackendApiOpenApiDocument('http://localhost');
const staticHandler = () => Response.json({ acknowledged: true });
const workflowJobsHandler = () => Response.json({ route: 'workflow-jobs' });
const app = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: staticHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  fileStorageHandler: staticHandler,
  workflowJobsHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
});
const missingWorkflowJobsApp = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: staticHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  fileStorageHandler: staticHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
});
const routeResponse = await app.request(
  new Request(
    'http://localhost' + workflowJobsApiBasePath + '/repair-gaps?sourceModuleId=search',
    {
      method: 'GET',
      headers: {
        [subscriberJourneySessionHeaderName]: 'sess_platform_operator_1',
      },
    },
  ),
);
const missingRouteResponse = await missingWorkflowJobsApp.request(
  new Request(
    'http://localhost' + workflowJobsApiBasePath + '/repair-gaps?sourceModuleId=search',
    {
      method: 'GET',
      headers: {
        [subscriberJourneySessionHeaderName]: 'sess_platform_operator_1',
      },
    },
  ),
);
console.log(JSON.stringify({
  listResponseRef: document.paths[workflowJobsApiPath.listRepairGaps]?.get?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  list403Description: document.paths[workflowJobsApiPath.listRepairGaps]?.get?.responses?.['403']?.description,
  list404Description: document.paths[workflowJobsApiPath.listRepairGaps]?.get?.responses?.['404']?.description,
  listParameterNames: (document.paths[workflowJobsApiPath.listRepairGaps]?.get?.parameters ?? []).map((parameter) => parameter.name),
  replayRequestRef: document.paths[workflowJobsApiPath.replayRepairGap]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  replayResponseRef: document.paths[workflowJobsApiPath.replayRepairGap]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  replay200Description: document.paths[workflowJobsApiPath.replayRepairGap]?.post?.responses?.['200']?.description,
  replay401Description: document.paths[workflowJobsApiPath.replayRepairGap]?.post?.responses?.['401']?.description,
  replay403Description: document.paths[workflowJobsApiPath.replayRepairGap]?.post?.responses?.['403']?.description,
  replay404Description: document.paths[workflowJobsApiPath.replayRepairGap]?.post?.responses?.['404']?.description,
  replay409Description: document.paths[workflowJobsApiPath.replayRepairGap]?.post?.responses?.['409']?.description,
  replay502Description: document.paths[workflowJobsApiPath.replayRepairGap]?.post?.responses?.['502']?.description,
  cancelRequestRef: document.paths[workflowJobsApiPath.cancelRepairGap]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  cancelResponseRef: document.paths[workflowJobsApiPath.cancelRepairGap]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  cancel401Description: document.paths[workflowJobsApiPath.cancelRepairGap]?.post?.responses?.['401']?.description,
  cancel403Description: document.paths[workflowJobsApiPath.cancelRepairGap]?.post?.responses?.['403']?.description,
  cancel404Description: document.paths[workflowJobsApiPath.cancelRepairGap]?.post?.responses?.['404']?.description,
  cancel409Description: document.paths[workflowJobsApiPath.cancelRepairGap]?.post?.responses?.['409']?.description,
  cancel502Description: document.paths[workflowJobsApiPath.cancelRepairGap]?.post?.responses?.['502']?.description,
  routeStatus: routeResponse.status,
  routeBody: await routeResponse.json(),
  missingRouteStatus: missingRouteResponse.status,
  missingRouteBody: await missingRouteResponse.json(),
  subscriberJourneySessionHeaderName,
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
    readonly listResponseRef?: string;
    readonly list403Description?: string;
    readonly list404Description?: string;
    readonly listParameterNames: readonly string[];
    readonly replayRequestRef?: string;
    readonly replayResponseRef?: string;
    readonly replay200Description?: string;
    readonly replay401Description?: string;
    readonly replay403Description?: string;
    readonly replay404Description?: string;
    readonly replay409Description?: string;
    readonly replay502Description?: string;
    readonly cancelRequestRef?: string;
    readonly cancelResponseRef?: string;
    readonly cancel401Description?: string;
    readonly cancel403Description?: string;
    readonly cancel404Description?: string;
    readonly cancel409Description?: string;
    readonly cancel502Description?: string;
    readonly routeStatus: number;
    readonly routeBody: {
      readonly route: string;
    };
    readonly missingRouteStatus: number;
    readonly missingRouteBody: {
      readonly error: string;
    };
    readonly subscriberJourneySessionHeaderName: string;
  };
};

describe("platform backend api workflow-jobs transport", () => {
  it("documents and mounts the workflow-jobs backend routes", () => {
    const probe = runBackendApiWorkflowJobsProbe();

    expect(probe.listResponseRef).toBe(
      "#/components/schemas/WorkflowJobRepairGapListResponse",
    );
    expect(probe.list403Description).toBe(
      "Workflow job repair-gap inspection is not allowed for this session.",
    );
    expect(probe.list404Description).toBe("Requested resource was not found.");
    expect(probe.listParameterNames).toEqual([
      probe.subscriberJourneySessionHeaderName,
      "sourceModuleId",
      "inspectionReason",
    ]);
    expect(probe.replayRequestRef).toBe(
      "#/components/schemas/ReplayWorkflowJobRepairGapRequest",
    );
    expect(probe.replayResponseRef).toBe(
      "#/components/schemas/WorkflowJobRepairGapReplayResponse",
    );
    expect(probe.replay200Description).toBe(
      "Workflow repair gap replay accepted and current row state returned.",
    );
    expect(probe.replay401Description).toBe(
      "Authenticated operator session and Keycloak bearer token are required.",
    );
    expect(probe.replay403Description).toBe(
      "Workflow repair-gap replay is not allowed for this session, or operator identity and workflow token provenance did not match.",
    );
    expect(probe.replay404Description).toBe(
      "Requested workflow repair gap was not found, or the authenticated operator session could not be resolved.",
    );
    expect(probe.replay409Description).toBe(
      "Workflow repair gap is no longer eligible for replay.",
    );
    expect(probe.replay502Description).toBe(
      "A backend dependency request failed.",
    );
    expect(probe.cancelRequestRef).toBe(
      "#/components/schemas/CancelWorkflowJobRepairGapRequest",
    );
    expect(probe.cancelResponseRef).toBe(
      "#/components/schemas/WorkflowJobRepairGapCancelResponse",
    );
    expect(probe.cancel401Description).toBe(
      "Authenticated operator session and Keycloak bearer token are required.",
    );
    expect(probe.cancel403Description).toBe(
      "Workflow repair-gap cancellation is not allowed for this session, or operator identity and workflow token provenance did not match.",
    );
    expect(probe.cancel404Description).toBe(
      "Requested workflow repair gap was not found, or the authenticated operator session could not be resolved.",
    );
    expect(probe.cancel409Description).toBe(
      "Workflow repair gap is no longer eligible for cancellation.",
    );
    expect(probe.cancel502Description).toBe(
      "A backend dependency request failed.",
    );
    expect(probe.routeStatus).toBe(200);
    expect(probe.routeBody).toEqual({ route: "workflow-jobs" });
    expect(probe.missingRouteStatus).toBe(404);
    expect(probe.missingRouteBody).toEqual({
      error: "Workflow jobs route not found.",
    });
  }, 90_000);
});
