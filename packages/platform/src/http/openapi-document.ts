import { Effect, JSONSchema, Schema } from "effect";
import {
  AuditEventSchema,
  BillingCheckoutSessionInputSchema,
  BillingCheckoutSessionSchema,
  BillingReconciliationManualRunResultSchema,
  BillingRepairGapReplayResultSchema,
  BillingRepairGapListRequestSchema,
  BillingRepairGapListResultSchema,
  BillingPlanCreateRequestSchema,
  BillingPlanCreateResultSchema,
  PlatformModuleIdSchema,
  PublicBillingPlanCatalogSchema,
  RequestContextSchema,
} from "@comvestec/contracts";
import {
  AuthorizationDecisionSchema,
  BillingEntitlementRecordSchema,
  BillingWebhookProcessingResultSchema,
  IdentitySessionCompletionResultSchema,
  IdentitySessionStartResultSchema,
  RuntimeConfigOverrideRecordSchema,
  RuntimeConfigSyncArtifactRecordSchema,
} from "@comvestec/modules";
import { ProductAppSnapshotSchema } from "../services/apps/app-snapshots";
import {
  BillingWebhookReplayRequestSchema,
  WebhookIgnoredResponseSchema,
  webhooksApiPath,
} from "../services/communication/webhooks-api-access-http";
import { adminBillingApiPath } from "../services/domains/admin-billing-http";
import {
  ReplayBillingRepairGapHttpRequestSchema,
  RunManualBillingReconciliationHttpRequestSchema,
} from "../services/domains/admin-billing-http";
import {
  CompleteAuthenticationRequestSchema,
  ProductBootstrapRequestSchema,
  ResolveRequestContextRequestSchema,
  StartAuthenticationRequestSchema,
  subscriberJourneyApiPath,
} from "../services/domains/subscriber-journey-http";
import { ProductBootstrapBillingStatusSchema } from "../services/domains/subscriber-journey";
import {
  AdminGovernanceAuditEventViewListSchema,
  AdminGovernanceReadBySessionRequestSchema,
  AdminGovernanceRuntimeConfigOverrideViewListSchema,
  AdminGovernanceRuntimeConfigProposalViewListSchema,
  PersistRuntimeConfigProposalsRequestSchema,
  UpsertRuntimeConfigOverrideRequestSchema,
} from "../services/governance/admin-governance";
import { adminGovernanceApiPath } from "../services/governance/admin-governance-http";

type OpenApiSchema = Readonly<Record<string, unknown>>;

type OpenApiMediaType = {
  readonly schema: OpenApiSchema;
};

type OpenApiResponse = {
  readonly description: string;
  readonly content?: Readonly<Record<string, OpenApiMediaType>>;
};

type OpenApiParameter = {
  readonly name: string;
  readonly in: "header" | "path" | "query";
  readonly required?: boolean;
  readonly description?: string;
  readonly schema: OpenApiSchema;
};

type OpenApiOperation = {
  readonly tags?: readonly string[];
  readonly summary: string;
  readonly description?: string;
  readonly parameters?: readonly OpenApiParameter[];
  readonly requestBody?: {
    readonly required?: boolean;
    readonly description?: string;
    readonly content: Readonly<Record<string, OpenApiMediaType>>;
  };
  readonly responses: Readonly<Record<string, OpenApiResponse>>;
};

type OpenApiPathItem = {
  readonly get?: OpenApiOperation;
  readonly post?: OpenApiOperation;
};

export type BackendApiOpenApiDocument = {
  readonly openapi: "3.1.0";
  readonly info: {
    readonly title: string;
    readonly version: string;
    readonly description: string;
  };
  readonly servers: readonly {
    readonly url: string;
    readonly description?: string;
  }[];
  readonly tags: readonly {
    readonly name: string;
    readonly description: string;
  }[];
  readonly paths: Readonly<Record<string, OpenApiPathItem>>;
  readonly components: {
    readonly schemas: Readonly<Record<string, OpenApiSchema>>;
  };
};

type DocumentSchemaSource = {
  readonly name: string;
  readonly schema: Schema.Schema.AnyNoContext;
};

const makeJsonSchema = (
  schema: Schema.Schema.AnyNoContext,
): Record<string, unknown> =>
  JSONSchema.make(schema, {
    target: "openApi3.1",
  }) as unknown as Record<string, unknown>;

export const backendApiOpenApiPath = "/api/openapi.json";

const ErrorResponseSchema = Schema.Struct({
  error: Schema.NonEmptyString,
});

const PublicBillingPlanCatalogResponseSchema = Schema.Struct({
  plans: PublicBillingPlanCatalogSchema,
});

const ResolveRequestContextResponseSchema = Schema.Struct({
  requestContext: RequestContextSchema,
});

const RuntimeConfigSyncArtifactRecordListSchema = Schema.Array(
  RuntimeConfigSyncArtifactRecordSchema,
);

const UpsertRuntimeConfigOverrideResponseSchema = Schema.Struct({
  override: RuntimeConfigOverrideRecordSchema,
  auditEvent: AuditEventSchema,
});

const RawWebhookPayloadSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown,
});

const backendApiDocumentSchemas = [
  {
    name: "ErrorResponse",
    schema: ErrorResponseSchema,
  },
  {
    name: "PublicBillingPlanCatalogResponse",
    schema: PublicBillingPlanCatalogResponseSchema,
  },
  {
    name: "StartAuthenticationRequest",
    schema: StartAuthenticationRequestSchema,
  },
  {
    name: "StartAuthenticationResponse",
    schema: IdentitySessionStartResultSchema,
  },
  {
    name: "CompleteAuthenticationRequest",
    schema: CompleteAuthenticationRequestSchema,
  },
  {
    name: "CompleteAuthenticationResponse",
    schema: IdentitySessionCompletionResultSchema,
  },
  {
    name: "RequestContext",
    schema: RequestContextSchema,
  },
  {
    name: "ResolveRequestContextRequest",
    schema: ResolveRequestContextRequestSchema,
  },
  {
    name: "ResolveRequestContextResponse",
    schema: ResolveRequestContextResponseSchema,
  },
  {
    name: "BillingCheckoutSessionInput",
    schema: BillingCheckoutSessionInputSchema,
  },
  {
    name: "BillingCheckoutSession",
    schema: BillingCheckoutSessionSchema,
  },
  {
    name: "ProductBootstrapRequest",
    schema: ProductBootstrapRequestSchema,
  },
  {
    name: "PlatformModuleId",
    schema: PlatformModuleIdSchema,
  },
  {
    name: "ProductBootstrapBillingStatus",
    schema: ProductBootstrapBillingStatusSchema,
  },
  {
    name: "ProductAppSnapshot",
    schema: ProductAppSnapshotSchema,
  },
  {
    name: "AuthorizationDecision",
    schema: AuthorizationDecisionSchema,
  },
  {
    name: "BillingEntitlementRecord",
    schema: BillingEntitlementRecordSchema,
  },
  {
    name: "BillingPlanCreateRequest",
    schema: BillingPlanCreateRequestSchema,
  },
  {
    name: "BillingPlanCreateResponse",
    schema: BillingPlanCreateResultSchema,
  },
  {
    name: "BillingRepairGapListRequest",
    schema: BillingRepairGapListRequestSchema,
  },
  {
    name: "BillingRepairGapListResponse",
    schema: BillingRepairGapListResultSchema,
  },
  {
    name: "ReplayBillingRepairGapRequest",
    schema: ReplayBillingRepairGapHttpRequestSchema,
  },
  {
    name: "BillingRepairGapReplayResponse",
    schema: BillingRepairGapReplayResultSchema,
  },
  {
    name: "RunManualBillingReconciliationRequest",
    schema: RunManualBillingReconciliationHttpRequestSchema,
  },
  {
    name: "BillingReconciliationManualRunResponse",
    schema: BillingReconciliationManualRunResultSchema,
  },
  {
    name: "AdminGovernanceReadBySessionRequest",
    schema: AdminGovernanceReadBySessionRequestSchema,
  },
  {
    name: "UpsertRuntimeConfigOverrideRequest",
    schema: UpsertRuntimeConfigOverrideRequestSchema,
  },
  {
    name: "PersistRuntimeConfigProposalsRequest",
    schema: PersistRuntimeConfigProposalsRequestSchema,
  },
  {
    name: "RuntimeConfigSyncArtifactRecordList",
    schema: RuntimeConfigSyncArtifactRecordListSchema,
  },
  {
    name: "AdminGovernanceRuntimeConfigOverrideViewList",
    schema: AdminGovernanceRuntimeConfigOverrideViewListSchema,
  },
  {
    name: "AdminGovernanceRuntimeConfigProposalViewList",
    schema: AdminGovernanceRuntimeConfigProposalViewListSchema,
  },
  {
    name: "AdminGovernanceAuditEventViewList",
    schema: AdminGovernanceAuditEventViewListSchema,
  },
  {
    name: "UpsertRuntimeConfigOverrideResponse",
    schema: UpsertRuntimeConfigOverrideResponseSchema,
  },
  {
    name: "BillingWebhookReplayRequest",
    schema: BillingWebhookReplayRequestSchema,
  },
  {
    name: "WebhookIgnoredResponse",
    schema: WebhookIgnoredResponseSchema,
  },
  {
    name: "WebhookProcessingResponse",
    schema: BillingWebhookProcessingResultSchema,
  },
  {
    name: "RawWebhookPayload",
    schema: RawWebhookPayloadSchema,
  },
] satisfies readonly DocumentSchemaSource[];

const typedDocumentSchemas: readonly DocumentSchemaSource[] =
  backendApiDocumentSchemas;

const ref = (schemaName: string): OpenApiSchema => ({
  $ref: `#/components/schemas/${schemaName}`,
});

const jsonResponse = (
  schema: OpenApiSchema,
  description: string,
): OpenApiResponse => ({
  description,
  content: {
    "application/json": {
      schema,
    },
  },
});

const errorResponse = (description: string): OpenApiResponse =>
  jsonResponse(ref("ErrorResponse"), description);

const jsonRequestBody = (
  schemaName: string,
  description?: string,
): NonNullable<OpenApiOperation["requestBody"]> => ({
  required: true,
  ...(description !== undefined ? { description } : {}),
  content: {
    "application/json": {
      schema: ref(schemaName),
    },
  },
});

const normalizeOpenApiSchema = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeOpenApiSchema(entry));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "$schema" && key !== "$defs")
        .map(([key, entry]) => [
          key,
          key === "$ref" && typeof entry === "string"
            ? entry.replace("#/$defs/", "#/components/schemas/")
            : normalizeOpenApiSchema(entry),
        ]),
    );
  }

  return value;
};

type OpenApiSchemaComponentConflictError = {
  readonly _tag: "OpenApiSchemaComponentConflictError";
  readonly name: string;
};

const registerComponentSchema = (
  schemas: Record<string, OpenApiSchema>,
  name: string,
  schema: OpenApiSchema,
): Effect.Effect<void, OpenApiSchemaComponentConflictError> => {
  const existingSchema = schemas[name];

  if (existingSchema === undefined) {
    return Effect.sync(() => {
      schemas[name] = schema;
    });
  }

  return JSON.stringify(existingSchema) === JSON.stringify(schema)
    ? Effect.void
    : Effect.fail({
        _tag: "OpenApiSchemaComponentConflictError",
        name,
      } satisfies OpenApiSchemaComponentConflictError);
};

const createBackendApiSchemaComponents = (): Readonly<
  Record<string, OpenApiSchema>
> =>
  Effect.runSync(
    Effect.gen(function* () {
      const schemas: Record<string, OpenApiSchema> = {};

      for (const source of typedDocumentSchemas) {
        const jsonSchema = makeJsonSchema(source.schema);

        const definitions = jsonSchema.$defs;

        if (definitions !== undefined && definitions !== null) {
          for (const [definitionName, definitionSchema] of Object.entries(
            definitions as Record<string, unknown>,
          )) {
            yield* registerComponentSchema(
              schemas,
              definitionName,
              normalizeOpenApiSchema(definitionSchema) as OpenApiSchema,
            );
          }
        }

        yield* registerComponentSchema(
          schemas,
          source.name,
          normalizeOpenApiSchema(jsonSchema) as OpenApiSchema,
        );
      }

      // ProductBootstrapResult is a composite of separately-registered component
      // schemas. Registering it via refs avoids a circular-dependency issue between
      // @comvestec/platform and @comvestec/modules at module evaluation time.
      yield* registerComponentSchema(schemas, "ProductBootstrapResult", {
        type: "object",
        required: ["requestContext", "authorization"],
        properties: {
          requestContext: { $ref: "#/components/schemas/RequestContext" },
          snapshot: { $ref: "#/components/schemas/ProductAppSnapshot" },
          authorization: {
            $ref: "#/components/schemas/AuthorizationDecision",
          },
          billingStatus: {
            $ref: "#/components/schemas/ProductBootstrapBillingStatus",
          },
          enabledModules: {
            type: "array",
            items: { $ref: "#/components/schemas/PlatformModuleId" },
          },
        },
        additionalProperties: false,
      });

      return schemas;
    }).pipe(
      Effect.mapError(
        (error: OpenApiSchemaComponentConflictError) =>
          new Error(`OpenAPI schema component conflict for ${error.name}.`),
      ),
    ),
  );

const nonEmptyHeaderSchema = {
  type: "string",
  minLength: 1,
} as const satisfies OpenApiSchema;

export const createBackendApiOpenApiDocument = (
  serverUrl: string,
): BackendApiOpenApiDocument => ({
  openapi: "3.1.0",
  info: {
    title: "Comvestec Backend API",
    version: "0.0.0",
    description:
      "Backend-owned HTTP surface for the Comvestec SaaS foundation. First-party apps primarily call shared backend services directly; this OpenAPI document is generated from the Effect schemas that define the standalone H3 transport boundary.",
  },
  servers: [
    {
      url: serverUrl,
      description: "Active backend API origin",
    },
  ],
  tags: [
    {
      name: "subscriber-journey",
      description:
        "Acquisition, authentication, request-context, and product-bootstrap routes.",
    },
    {
      name: "admin-billing",
      description: "Operator billing plan management routes.",
    },
    {
      name: "admin-governance",
      description:
        "Runtime-config and audit-governance routes intended for internal operator workflows.",
    },
    {
      name: "webhooks",
      description: "Billing provider webhook verification and replay routes.",
    },
  ],
  paths: {
    [subscriberJourneyApiPath.listPublicPlans]: {
      get: {
        tags: ["subscriber-journey"],
        summary: "List public billing plans",
        description:
          "Returns the publicly visible billing plan catalog for acquisition flows.",
        responses: {
          "200": jsonResponse(
            ref("PublicBillingPlanCatalogResponse"),
            "Public billing plan catalog.",
          ),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Subscriber journey request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [subscriberJourneyApiPath.startAuthentication]: {
      post: {
        tags: ["subscriber-journey"],
        summary: "Start authentication",
        description:
          "Begins a first-party authentication flow and returns a Keycloak redirect payload.",
        requestBody: jsonRequestBody("StartAuthenticationRequest"),
        responses: {
          "202": jsonResponse(
            ref("StartAuthenticationResponse"),
            "Authentication redirect created.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse("Authentication failed."),
          "422": errorResponse(
            "Provider payload could not be mapped to the platform contract.",
          ),
          "500": errorResponse("Subscriber journey request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [subscriberJourneyApiPath.completeAuthentication]: {
      post: {
        tags: ["subscriber-journey"],
        summary: "Complete authentication",
        description:
          "Completes the first-party auth callback flow using a signed callback state and a Keycloak session input.",
        requestBody: jsonRequestBody("CompleteAuthenticationRequest"),
        responses: {
          "202": jsonResponse(
            ref("CompleteAuthenticationResponse"),
            "Authentication completed and onboarding or provisioning state returned.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Authentication or callback-state validation failed.",
          ),
          "422": errorResponse(
            "Provider payload could not be mapped to the platform contract.",
          ),
          "500": errorResponse("Subscriber journey request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [subscriberJourneyApiPath.resolveRequestContext]: {
      post: {
        tags: ["subscriber-journey"],
        summary: "Resolve request context",
        description:
          "Looks up the effective request context for a previously established session.",
        requestBody: jsonRequestBody("ResolveRequestContextRequest"),
        responses: {
          "200": jsonResponse(
            ref("ResolveRequestContextResponse"),
            "Resolved request context.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Subscriber journey request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [subscriberJourneyApiPath.createCheckoutSession]: {
      post: {
        tags: ["subscriber-journey"],
        summary: "Create hosted checkout session",
        description:
          "Creates a Polar hosted checkout session for an entitled tenant scope.",
        requestBody: jsonRequestBody("BillingCheckoutSessionInput"),
        responses: {
          "202": jsonResponse(
            ref("BillingCheckoutSession"),
            "Hosted checkout session created.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "422": errorResponse(
            "Provider payload could not be mapped to the platform contract.",
          ),
          "500": errorResponse("Subscriber journey request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [subscriberJourneyApiPath.buildProductBootstrap]: {
      post: {
        tags: ["subscriber-journey"],
        summary: "Build product bootstrap",
        description:
          "Builds the route-owned product bootstrap payload for an authenticated session.",
        requestBody: jsonRequestBody("ProductBootstrapRequest"),
        responses: {
          "200": jsonResponse(
            ref("ProductBootstrapResult"),
            "Product bootstrap payload.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "500": errorResponse("Subscriber journey request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminBillingApiPath.createManagedPlan]: {
      post: {
        tags: ["admin-billing"],
        summary: "Create managed billing plan",
        description:
          "Creates a managed recurring plan in the billing provider for operator workflows.",
        requestBody: jsonRequestBody("BillingPlanCreateRequest"),
        responses: {
          "202": jsonResponse(
            ref("BillingPlanCreateResponse"),
            "Managed billing plan created.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "403": errorResponse(
            "Billing plan management is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "405": errorResponse("Method not allowed."),
          "422": errorResponse(
            "Provider payload could not be mapped to the platform contract.",
          ),
          "500": errorResponse("Admin billing request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminBillingApiPath.listRepairGaps]: {
      get: {
        tags: ["admin-billing"],
        summary: "List billing repair gaps",
        description:
          "Lists unresolved scheduled, blocked, and stale running billing repair gaps for platform operators.",
        parameters: [
          {
            name: "sessionId",
            in: "query",
            required: true,
            description: "Authenticated operator session identifier.",
            schema: nonEmptyHeaderSchema,
          },
        ],
        responses: {
          "200": jsonResponse(
            ref("BillingRepairGapListResponse"),
            "Unresolved billing repair gaps.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "403": errorResponse(
            "Billing repair gap inspection is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Admin billing request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminBillingApiPath.replayRepairGap]: {
      post: {
        tags: ["admin-billing"],
        summary: "Replay billing repair gap",
        description:
          "Replays an unresolved billing repair gap for a specific workflow job through an authenticated Convex execution.",
        parameters: [
          {
            name: "authorization",
            in: "header",
            required: true,
            description:
              "Bearer Keycloak ID token for the initiating operator. Format: Bearer <token>.",
            schema: nonEmptyHeaderSchema,
          },
          {
            name: "x-comvestec-session-id",
            in: "header",
            required: true,
            description: "Authenticated operator session identifier.",
            schema: nonEmptyHeaderSchema,
          },
        ],
        requestBody: jsonRequestBody("ReplayBillingRepairGapRequest"),
        responses: {
          "200": jsonResponse(
            ref("BillingRepairGapReplayResponse"),
            "Billing repair gap replay completed.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Authenticated operator session and a Keycloak bearer token accepted for Convex execution are required for repair replay execution.",
          ),
          "403": errorResponse(
            "Billing repair replay requires authorized platform-operator access and a decodable Convex token whose subject matches the operator session.",
          ),
          "404": errorResponse("Requested billing repair gap was not found."),
          "405": errorResponse("Method not allowed."),
          "409": errorResponse(
            "Billing repair gap is no longer eligible for replay.",
          ),
          "500": errorResponse("Admin billing request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminBillingApiPath.runManualReconciliation]: {
      post: {
        tags: ["admin-billing"],
        summary: "Run billing reconciliation now",
        description:
          "Runs the due billing reconciliation sweep immediately through an authenticated Convex action and returns the workflow jobs that were processed.",
        parameters: [
          {
            name: "authorization",
            in: "header",
            required: true,
            description:
              "Bearer Keycloak ID token for the initiating operator. Format: Bearer <token>.",
            schema: nonEmptyHeaderSchema,
          },
          {
            name: "x-comvestec-session-id",
            in: "header",
            required: true,
            description: "Authenticated operator session identifier.",
            schema: nonEmptyHeaderSchema,
          },
        ],
        requestBody: jsonRequestBody("RunManualBillingReconciliationRequest"),
        responses: {
          "200": jsonResponse(
            ref("BillingReconciliationManualRunResponse"),
            "Authenticated billing reconciliation run completed.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Authenticated operator session and Keycloak bearer token are required.",
          ),
          "403": errorResponse(
            "Manual billing reconciliation is not allowed for this session.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "405": errorResponse("Method not allowed."),
          "500": errorResponse("Admin billing request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.listRuntimeConfigOverrides]: {
      post: {
        tags: ["admin-governance"],
        summary: "List runtime-config overrides",
        description:
          "Lists persisted runtime-config overrides for a module. Internal operator surface.",
        requestBody: jsonRequestBody("AdminGovernanceReadBySessionRequest"),
        responses: {
          "200": jsonResponse(
            ref("AdminGovernanceRuntimeConfigOverrideViewList"),
            "Persisted runtime-config overrides.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin governance reads require a valid authenticated session with an authenticated operator.",
          ),
          "403": errorResponse(
            "Admin governance reads are restricted to platform and support operators.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.upsertRuntimeConfigOverride]: {
      post: {
        tags: ["admin-governance"],
        summary: "Upsert runtime-config override",
        description:
          "Persists a runtime-config override and emits an audit event. Internal operator surface.",
        requestBody: jsonRequestBody("UpsertRuntimeConfigOverrideRequest"),
        responses: {
          "202": jsonResponse(
            ref("UpsertRuntimeConfigOverrideResponse"),
            "Runtime-config override persisted.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Runtime-config mutations require an authenticated actor.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.persistRuntimeConfigProposals]: {
      post: {
        tags: ["admin-governance"],
        summary: "Persist runtime-config proposals",
        description:
          "Persists code-to-runtime proposal artifacts for a module. Internal operator surface.",
        requestBody: jsonRequestBody("PersistRuntimeConfigProposalsRequest"),
        responses: {
          "202": jsonResponse(
            ref("RuntimeConfigSyncArtifactRecordList"),
            "Persisted runtime-config proposal artifacts.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.listRuntimeConfigProposals]: {
      post: {
        tags: ["admin-governance"],
        summary: "List runtime-config proposals",
        description:
          "Lists persisted runtime-config proposal artifacts for a module. Internal operator surface.",
        requestBody: jsonRequestBody("AdminGovernanceReadBySessionRequest"),
        responses: {
          "200": jsonResponse(
            ref("AdminGovernanceRuntimeConfigProposalViewList"),
            "Persisted runtime-config proposals.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin governance reads require a valid authenticated session with an authenticated operator.",
          ),
          "403": errorResponse(
            "Admin governance reads are restricted to platform and support operators.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [adminGovernanceApiPath.queryAuditEventsByModule]: {
      post: {
        tags: ["admin-governance"],
        summary: "Query audit events by module",
        description:
          "Queries audit-log events for a module. Internal operator surface.",
        requestBody: jsonRequestBody("AdminGovernanceReadBySessionRequest"),
        responses: {
          "200": jsonResponse(
            ref("AdminGovernanceAuditEventViewList"),
            "Audit events for the requested module.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Admin governance reads require a valid authenticated session with an authenticated operator.",
          ),
          "403": errorResponse(
            "Admin governance reads are restricted to platform and support operators.",
          ),
          "500": errorResponse("Admin governance request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [webhooksApiPath.processPolarWebhook]: {
      post: {
        tags: ["webhooks"],
        summary: "Process Polar webhook",
        description:
          "Verifies and processes an inbound Polar webhook. The raw request body and signature headers must be preserved.",
        parameters: [
          {
            name: "webhook-id",
            in: "header",
            required: true,
            description: "Provider webhook delivery identifier.",
            schema: nonEmptyHeaderSchema,
          },
          {
            name: "webhook-timestamp",
            in: "header",
            required: true,
            description:
              "Provider webhook timestamp header used for signature verification.",
            schema: nonEmptyHeaderSchema,
          },
          {
            name: "webhook-signature",
            in: "header",
            required: true,
            description:
              "Provider webhook signature header used for request verification.",
            schema: nonEmptyHeaderSchema,
          },
        ],
        requestBody: jsonRequestBody(
          "RawWebhookPayload",
          "Raw provider webhook JSON payload.",
        ),
        responses: {
          "202": jsonResponse(
            {
              oneOf: [
                ref("WebhookIgnoredResponse"),
                ref("WebhookProcessingResponse"),
              ],
            },
            "Webhook accepted for processing or intentionally ignored.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "401": errorResponse(
            "Authentication or signature validation failed.",
          ),
          "422": errorResponse(
            "Provider payload could not be mapped to the platform contract.",
          ),
          "500": errorResponse("Webhook API request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
    [webhooksApiPath.replayPolarWebhook]: {
      post: {
        tags: ["webhooks"],
        summary: "Replay Polar webhook",
        description:
          "Replays a previously stored Polar webhook delivery by delivery identifier.",
        requestBody: jsonRequestBody("BillingWebhookReplayRequest"),
        responses: {
          "202": jsonResponse(
            ref("WebhookProcessingResponse"),
            "Webhook replay accepted and processed.",
          ),
          "400": errorResponse(
            "Request payload did not match the expected schema.",
          ),
          "404": errorResponse("Requested resource was not found."),
          "422": errorResponse(
            "Provider payload could not be mapped to the platform contract.",
          ),
          "500": errorResponse("Webhook API request failed."),
          "502": errorResponse("A backend dependency request failed."),
        },
      },
    },
  },
  components: {
    schemas: createBackendApiSchemaComponents(),
  },
});
