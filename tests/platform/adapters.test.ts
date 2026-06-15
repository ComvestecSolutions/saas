import { createSign, generateKeyPairSync } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { Effect } from "effect";
import { searchFields } from "@comvestec/config";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  billingEnforcementMode,
  billingMeteringMode,
  billingPlanInterval,
  billingPlanVisibility,
  billingSubscriptionStatus,
  billingWebhookEventType,
  billingWebhookReconciliationAction,
  emailDeliveryBounceType,
  emailDeliveryProviderEventType,
  identityClaimKey,
  platformModuleId,
  platformScope,
  searchDocumentFamily,
  searchIndexLifecycleState,
  searchSortDirection,
  searchSupportCaseSortField,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
  telemetryKind,
} from "@comvestec/contracts";
import {
  makeConvexAdapter,
  makeConvexFileStorageAdapter,
  makeGlitchtipAdapter,
  makeKeycloakAdapter,
  makeMeilisearchAdapter,
  makeNovuAdapter,
  makeOpenPanelAdapter,
  OpenPanelAdapterRequestError,
  makeObservabilityAdapter,
  ObservabilityAdapterRequestError,
  makeOpenmeterAdapter,
  makeOryKetoAdapter,
  makePolarAdapter,
  makePostgresAdapter,
  makePostgresAdapterFromEnvironment,
  makePostalAdapter,
  makeUnleashAdapter,
  resolveGlitchtipSecurityReportEndpoint,
  validateAndNormalizePostalWebhookRequest,
  makeValkeyAdapter,
  GlitchtipAdapterConfigurationError,
  GlitchtipAdapterRequestError,
  platformAdapterServiceName,
} from "@comvestec/platform";
import {
  createKeycloakTestOptions,
  createOryKetoTestOptions,
  createPolarTestOptions,
  createValkeyTestClient,
  defaultTestBillingPlans,
} from "../platform-adapter-doubles";
import { unleashBackendClientName } from "../../packages/platform/src/adapters/features-billing/unleash-shared";
import { makeAuthenticatedConvexWorkflowClient } from "../../packages/platform/src/adapters/storage/convex";

const keycloakIdentityTokenTestKeyId = "keycloak-identity-token-test-key";
const keycloakIdentityTokenTestKeyPair = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const keycloakIdentityTokenTestPublicJwk = {
  ...(keycloakIdentityTokenTestKeyPair.publicKey.export({
    format: "jwk",
  }) as JsonWebKey),
  kid: keycloakIdentityTokenTestKeyId,
  alg: "RS256",
  use: "sig",
};

const postalWebhookTestKeyId = "postal-webhook-test-key";
const postalWebhookTestKeyPair = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const postalWebhookTestPublicJwk = {
  ...(postalWebhookTestKeyPair.publicKey.export({
    format: "jwk",
  }) as JsonWebKey),
  kid: postalWebhookTestKeyId,
  alg: "RS256",
  use: "sig",
};
const postalWebhookTestSigningKeyBase64 = Buffer.from(
  postalWebhookTestKeyPair.privateKey.export({
    format: "pem",
    type: "pkcs1",
  }) as string,
  "utf8",
).toString("base64");

const createSignedPostalWebhookRequest = (body: string) => {
  const signer = createSign("RSA-SHA256");

  signer.update(body);
  signer.end();

  return new Request(
    "http://localhost/api/communication/email-delivery/provider-events/postal",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Postal-Signature-256": signer
          .sign(postalWebhookTestKeyPair.privateKey)
          .toString("base64"),
        "X-Postal-Signature-KID": postalWebhookTestKeyId,
      },
      body,
    },
  );
};

const createJsonTestResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const createPostalWebhookJwksResponse = () =>
  new Response(
    JSON.stringify({
      keys: [postalWebhookTestPublicJwk],
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

const encodeBase64UrlJson = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const createSignedKeycloakIdentityToken = (input: {
  readonly issuer: string;
  readonly audience: string;
  readonly subject: string;
  readonly authorizedParty?: string;
  readonly actorTypeValue?: string;
  readonly tenantHint?: string;
  readonly preferredUsername?: string;
  readonly tokenIdentifier?: string;
  readonly expiresInSeconds?: number;
  readonly keyId?: string;
  readonly algorithm?: string;
}) => {
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const headerSegment = encodeBase64UrlJson({
    alg: input.algorithm ?? "RS256",
    typ: "JWT",
    kid: input.keyId ?? keycloakIdentityTokenTestKeyId,
  });
  const payloadSegment = encodeBase64UrlJson({
    iss: input.issuer,
    aud: input.audience,
    sub: input.subject,
    exp: nowSeconds + (input.expiresInSeconds ?? 3_600),
    iat: nowSeconds,
    sid: `sess_${input.subject}`,
    ...(input.authorizedParty !== undefined
      ? { azp: input.authorizedParty }
      : {}),
    ...(input.actorTypeValue !== undefined
      ? { [identityClaimKey.actorType]: input.actorTypeValue }
      : {}),
    ...(input.tenantHint !== undefined
      ? { tenant_hint: input.tenantHint }
      : {}),
    ...(input.preferredUsername !== undefined
      ? { preferred_username: input.preferredUsername }
      : {}),
    ...(input.tokenIdentifier !== undefined
      ? { jti: input.tokenIdentifier }
      : {}),
  });
  const signedContent = `${headerSegment}.${payloadSegment}`;
  const signer = createSign("RSA-SHA256");

  signer.update(signedContent);
  signer.end();

  return `${signedContent}.${signer
    .sign(keycloakIdentityTokenTestKeyPair.privateKey)
    .toString("base64url")}`;
};

type UnleashTestDefinition = {
  readonly name: string;
  readonly enabled: boolean;
  readonly project?: string;
  readonly type?: string;
  readonly description?: string;
  readonly strategies?: readonly {
    readonly name: string;
    readonly parameters: Readonly<Record<string, unknown>>;
    readonly constraints?: readonly {
      readonly contextName: string;
      readonly operator: string;
      readonly inverted: boolean;
      readonly values?: readonly string[];
    }[];
  }[];
  readonly dependencies?: readonly {
    readonly feature: string;
    readonly enabled?: boolean;
    readonly variants?: readonly string[];
  }[];
};

const createUnleashTestClient = (
  definitions: readonly UnleashTestDefinition[],
) => {
  const definitionLookup = new Map(
    definitions.map((definition) => [definition.name, definition] as const),
  );

  return {
    getFeatureToggleDefinition: (flagKey: string) =>
      definitionLookup.get(flagKey),
    getFeatureToggleDefinitions: () => definitions,
    isEnabled: (
      flagKey: string,
      _context?: unknown,
      fallbackEnabled?: boolean,
    ) => definitionLookup.get(flagKey)?.enabled ?? fallbackEnabled ?? false,
  };
};

describe("platform adapters", () => {
  it("creates healthy service adapters", async () => {
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter(createKeycloakTestOptions()),
    );
    const convex = await Effect.runPromise(
      makeConvexAdapter({
        deploymentUrl: "http://127.0.0.1:3210",
        siteUrl: "http://127.0.0.1:3211",
        adminKey: "convex-admin-key",
        keycloakBaseUrl: "http://127.0.0.1:8080",
        keycloakRealm: "comvestec",
        keycloakClientId: "saas-platform",
        keycloakClientSecret: "change-me",
        keycloakConvexServiceActorUsername: "convex.billing.service",
        keycloakConvexServiceActorPassword: "service-secret",
        fetch: async () =>
          new Response(
            "This Convex deployment is running. See https://docs.convex.dev/.",
            { status: 200 },
          ),
      }),
    );
    const convexFileStorage = await Effect.runPromise(
      makeConvexFileStorageAdapter({
        deploymentUrl: "http://127.0.0.1:3210",
        siteUrl: "http://127.0.0.1:3211",
        keycloakBaseUrl: "http://127.0.0.1:8080",
        keycloakRealm: "comvestec",
        keycloakClientId: "saas-platform",
        keycloakClientSecret: "change-me",
        keycloakConvexServiceActorUsername: "convex.file-storage.service",
        keycloakConvexServiceActorPassword: "service-secret",
        fetch: async () =>
          new Response(
            "This Convex deployment is running. See https://docs.convex.dev/.",
            { status: 200 },
          ),
      }),
    );
    const observability = await Effect.runPromise(
      makeObservabilityAdapter({
        otlpHttpEndpoint: "http://localhost:4318",
        grafanaBaseUrl: "http://localhost:3001",
        fetch: async () => new Response(null, { status: 202 }),
      }),
    );

    await expect(Effect.runPromise(keycloak.healthcheck)).resolves.toEqual({
      healthy: true,
      service: platformAdapterServiceName.keycloak,
    });
    const loginRedirect = await Effect.runPromise(
      keycloak.buildLoginRedirect({
        tenantHint: "org_demo",
        displayNameHint: "Acme",
        themeHint: "#111827",
        redirectUri: "https://product.example.com/auth/callback",
      }),
    );
    const loginRedirectUrl = new URL(loginRedirect.url);

    expect(loginRedirect).toMatchObject({
      realm: "comvestec",
      tenantHint: "org_demo",
      displayNameHint: "Acme",
      themeHint: "#111827",
      redirectUri: "https://product.example.com/auth/callback",
    });
    expect(loginRedirectUrl.searchParams.get("tenant_hint")).toBe("org_demo");
    expect(loginRedirectUrl.searchParams.get("display_name_hint")).toBe("Acme");
    expect(loginRedirectUrl.searchParams.get("theme_hint")).toBe("#111827");
    await expect(
      Effect.runPromise(
        keycloak.validateSession({ accessToken: "access-token" }),
      ),
    ).resolves.toMatchObject({
      actorId: "usr_token",
      sessionId: "sess_token",
      realm: "comvestec",
    });
    await expect(
      Effect.runPromise(
        keycloak.issueIdTokenWithPasswordGrant({
          username: "convex.billing.service",
          password: "service-secret",
        }),
      ),
    ).resolves.toBe("id-token");
    await expect(
      Effect.runPromise(
        keycloak.issueImpersonationSession({
          impersonatedActorId: "usr_member_1",
        }),
      ),
    ).resolves.toMatchObject({
      idToken: "id-token:usr_member_1",
      expiresInSeconds: 1800,
      session: {
        actorId: "usr_member_1",
        actorType: actorType.organizationMember,
        sessionId: "sess_impersonation_usr_member_1",
        realm: "comvestec",
        tenantHint: "org_1",
      },
    });
    await expect(
      Effect.runPromise(
        keycloak.revokeSession({
          sessionId: "sess_impersonation_usr_member_1",
        }),
      ),
    ).resolves.toBeUndefined();
    await expect(Effect.runPromise(convex.healthcheck)).resolves.toEqual({
      healthy: true,
      service: platformAdapterServiceName.convex,
    });
    await expect(
      Effect.runPromise(convexFileStorage.healthcheck),
    ).resolves.toEqual({
      healthy: true,
      service: platformAdapterServiceName.convex,
    });
    await expect(Effect.runPromise(observability.healthcheck)).resolves.toEqual(
      {
        healthy: true,
        service: platformAdapterServiceName.observability,
      },
    );
  });

  it("uses Convex admin auth for internal workflow scheduling when available", async () => {
    const convexHttpClientPrototype =
      ConvexHttpClient.prototype as ConvexHttpClient & {
        readonly setAdminAuth: (
          token: string,
          actingUser: Record<string, string>,
        ) => void;
      };
    const setAdminAuthSpy = vi
      .spyOn(convexHttpClientPrototype, "setAdminAuth")
      .mockImplementation(() => {});
    const setAuthSpy = vi
      .spyOn(convexHttpClientPrototype, "setAuth")
      .mockImplementation(() => {});
    const mutationSpy = vi
      .spyOn(convexHttpClientPrototype, "mutation")
      .mockResolvedValue({
        scheduledFunctionId: "sched_1",
        scheduledFunctionIds: ["sched_1"],
        primaryScheduled: true,
        scheduledRecoveryAttemptCount: 0,
        expectedRecoveryAttemptCount: 0,
      });

    const convex = await Effect.runPromise(
      makeConvexAdapter({
        deploymentUrl: "http://127.0.0.1:3210",
        siteUrl: "http://127.0.0.1:3211",
        adminKey: "convex-admin-key",
        keycloakBaseUrl: "http://127.0.0.1:8080",
        keycloakRealm: "comvestec",
        keycloakClientId: "saas-platform",
        keycloakClientSecret: "change-me",
        keycloakConvexServiceActorUsername: "convex.billing.service",
        keycloakConvexServiceActorPassword: "service-secret",
      }),
    );

    await expect(
      Effect.runPromise(
        convex.scheduleBillingReconciliationWorkflowJob({
          jobId: "job_1",
          scheduledAt: "2026-05-08T00:00:00.000Z",
        }),
      ),
    ).resolves.toMatchObject({
      scheduledFunctionId: "sched_1",
    });

    expect(setAdminAuthSpy).toHaveBeenCalledWith("convex-admin-key", {
      subject: "convex.billing.service",
      issuer: "http://127.0.0.1:8080/realms/comvestec",
      preferredUsername: "convex.billing.service",
      [identityClaimKey.actorType]: actorType.serviceActor,
    });
    expect(setAuthSpy).not.toHaveBeenCalled();

    mutationSpy.mockRestore();
    setAuthSpy.mockRestore();
    setAdminAuthSpy.mockRestore();
  });

  it("uses Convex admin auth with operator claims for authenticated workflow execution when available", async () => {
    const convexHttpClientPrototype =
      ConvexHttpClient.prototype as ConvexHttpClient & {
        readonly setAdminAuth: (
          token: string,
          actingUser: Record<string, string>,
        ) => void;
      };
    const setAdminAuthSpy = vi
      .spyOn(convexHttpClientPrototype, "setAdminAuth")
      .mockImplementation(() => {});
    const setAuthSpy = vi
      .spyOn(convexHttpClientPrototype, "setAuth")
      .mockImplementation(() => {});
    const actionSpy = vi
      .spyOn(convexHttpClientPrototype, "action")
      .mockResolvedValue(null);
    const workflowClient = await Effect.runPromise(
      makeAuthenticatedConvexWorkflowClient({
        deploymentUrl: "http://127.0.0.1:3210",
        siteUrl: "http://127.0.0.1:3211",
        adminKey: "convex-admin-key",
        keycloakBaseUrl: "http://127.0.0.1:8080",
        keycloakRealm: "comvestec",
        keycloakClientId: "saas-platform",
        keycloakClientSecret: "change-me",
        keycloakConvexServiceActorUsername: "convex.workflow.service",
        keycloakConvexServiceActorPassword: "service-secret",
      }),
    );
    const operatorToken = createSignedKeycloakIdentityToken({
      issuer: "http://127.0.0.1:8080/realms/comvestec",
      audience: "saas-platform",
      subject: "usr_platform_operator_1",
      actorTypeValue: actorType.platformOperator,
      preferredUsername: "platform.operator.1",
      tokenIdentifier: "jti_platform_operator_1",
    });

    await expect(
      Effect.runPromise(
        workflowClient.runSearchTenantIndexEnsureWorkflowJob(
          {
            jobId: "job_1",
          },
          {
            authToken: operatorToken,
          },
        ),
      ),
    ).resolves.toBeNull();

    expect(setAdminAuthSpy).toHaveBeenCalledWith("convex-admin-key", {
      subject: "usr_platform_operator_1",
      issuer: "http://127.0.0.1:8080/realms/comvestec",
      preferredUsername: "platform.operator.1",
      tokenIdentifier: "jti_platform_operator_1",
      [identityClaimKey.actorType]: actorType.platformOperator,
    });
    expect(setAuthSpy).not.toHaveBeenCalled();

    actionSpy.mockRestore();
    setAuthSpy.mockRestore();
    setAdminAuthSpy.mockRestore();
  });

  it("uses Convex admin auth for file storage operations when available", async () => {
    const convexHttpClientPrototype =
      ConvexHttpClient.prototype as ConvexHttpClient & {
        readonly setAdminAuth: (
          token: string,
          actingUser: Record<string, string>,
        ) => void;
      };
    const setAdminAuthSpy = vi
      .spyOn(convexHttpClientPrototype, "setAdminAuth")
      .mockImplementation(() => {});
    const setAuthSpy = vi
      .spyOn(convexHttpClientPrototype, "setAuth")
      .mockImplementation(() => {});
    const querySpy = vi
      .spyOn(convexHttpClientPrototype, "query")
      .mockResolvedValue([]);

    const convexFileStorage = await Effect.runPromise(
      makeConvexFileStorageAdapter({
        deploymentUrl: "http://127.0.0.1:3210",
        siteUrl: "http://127.0.0.1:3211",
        adminKey: "convex-admin-key",
        keycloakBaseUrl: "http://127.0.0.1:8080",
        keycloakRealm: "comvestec",
        keycloakClientId: "saas-platform",
        keycloakClientSecret: "change-me",
        keycloakConvexServiceActorUsername: "convex.file-storage.service",
        keycloakConvexServiceActorPassword: "service-secret",
      }),
    );

    await expect(
      Effect.runPromise(
        convexFileStorage.listManagedFileRecords({
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    ).resolves.toEqual([]);

    expect(setAdminAuthSpy).toHaveBeenCalledWith("convex-admin-key", {
      subject: "convex.file-storage.service",
      issuer: "http://127.0.0.1:8080/realms/comvestec",
      preferredUsername: "convex.file-storage.service",
      [identityClaimKey.actorType]: actorType.serviceActor,
    });
    expect(setAuthSpy).not.toHaveBeenCalled();

    querySpy.mockRestore();
    setAuthSpy.mockRestore();
    setAdminAuthSpy.mockRestore();
  });

  it("accepts legacy Convex scheduling responses without scheduledFunctionIds", async () => {
    const mutationSpy = vi
      .spyOn(ConvexHttpClient.prototype as ConvexHttpClient, "mutation")
      .mockResolvedValue({
        scheduledFunctionId: "sched_1",
        primaryScheduled: true,
        scheduledRecoveryAttemptCount: 5,
        expectedRecoveryAttemptCount: 5,
      });

    const convex = await Effect.runPromise(
      makeConvexAdapter({
        deploymentUrl: "http://127.0.0.1:3210",
        siteUrl: "http://127.0.0.1:3211",
        adminKey: "convex-admin-key",
        keycloakBaseUrl: "http://127.0.0.1:8080",
        keycloakRealm: "comvestec",
        keycloakClientId: "saas-platform",
        keycloakClientSecret: "change-me",
        keycloakConvexServiceActorUsername: "convex.billing.service",
        keycloakConvexServiceActorPassword: "service-secret",
      }),
    );

    await expect(
      Effect.runPromise(
        convex.scheduleBillingReconciliationWorkflowJob({
          jobId: "job_legacy",
          scheduledAt: "2026-05-08T00:00:00.000Z",
        }),
      ),
    ).resolves.toEqual({
      scheduledFunctionId: "sched_1",
      scheduledFunctionIds: ["sched_1"],
      primaryScheduled: true,
      scheduledRecoveryAttemptCount: 5,
      expectedRecoveryAttemptCount: 5,
    });

    mutationSpy.mockRestore();
  });

  it("surfaces cleanup-unavailable failures for malformed token-exchange payloads without session state", async () => {
    const baseOptions = createKeycloakTestOptions();
    const tokenEndpoint = `${baseOptions.baseUrl}/realms/${baseOptions.realm}/protocol/openid-connect/token`;
    let capturedSubjectToken: string | null = null;
    let capturedSubjectTokenType: string | null = null;
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter({
        ...baseOptions,
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url === tokenEndpoint) {
            const requestBody = new URLSearchParams(String(init?.body ?? ""));

            if (
              requestBody.get("grant_type") ===
                "urn:ietf:params:oauth:grant-type:token-exchange" &&
              requestBody.get("requested_subject") === "usr_member_1"
            ) {
              capturedSubjectToken = requestBody.get("subject_token");
              capturedSubjectTokenType = requestBody.get("subject_token_type");
              return new Response(
                JSON.stringify({
                  id_token: "id-token:usr_member_1",
                  expires_in: 1800,
                }),
                {
                  status: 200,
                  headers: {
                    "Content-Type": "application/json",
                  },
                },
              );
            }
          }

          return baseOptions.fetch!(input, init);
        },
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        keycloak.issueImpersonationSession({
          impersonatedActorId: "usr_member_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "KeycloakImpersonationCleanupUnavailableError",
        issuanceFailure: {
          _tag: "KeycloakAdapterRequestError",
          operation: "tokenExchange",
        },
      },
    });
    expect(capturedSubjectToken).toBe("service-account-access-token");
    expect(capturedSubjectTokenType).toBe(
      "urn:ietf:params:oauth:token-type:access_token",
    );
  });

  it("validates Keycloak identity tokens against the issuer signing keys", async () => {
    const baseOptions = createKeycloakTestOptions();
    const issuer = `${baseOptions.baseUrl}/realms/${baseOptions.realm}`;
    const certsEndpoint = `${issuer}/protocol/openid-connect/certs`;
    const idToken = createSignedKeycloakIdentityToken({
      issuer,
      audience: baseOptions.clientId,
      subject: "usr_platform_operator_1",
      actorTypeValue: actorType.platformOperator,
      tenantHint: "org_1",
    });
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter({
        ...baseOptions,
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url === certsEndpoint) {
            return new Response(
              JSON.stringify({ keys: [keycloakIdentityTokenTestPublicJwk] }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                },
              },
            );
          }

          return baseOptions.fetch!(input, init);
        },
      }),
    );

    await expect(
      Effect.runPromise(keycloak.validateIdentityToken({ idToken })),
    ).resolves.toEqual({
      actorId: "usr_platform_operator_1",
      actorType: actorType.platformOperator,
      realm: baseOptions.realm,
      tenantHint: "org_1",
    });
  });

  it("accepts client-bound access-token claims when the authorized party matches the platform client", async () => {
    const baseOptions = createKeycloakTestOptions();
    const issuer = `${baseOptions.baseUrl}/realms/${baseOptions.realm}`;
    const certsEndpoint = `${issuer}/protocol/openid-connect/certs`;
    const idToken = createSignedKeycloakIdentityToken({
      issuer,
      audience: "account",
      authorizedParty: baseOptions.clientId,
      subject: "usr_platform_operator_1",
      actorTypeValue: actorType.platformOperator,
      tenantHint: "org_1",
    });
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter({
        ...baseOptions,
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url === certsEndpoint) {
            return new Response(
              JSON.stringify({ keys: [keycloakIdentityTokenTestPublicJwk] }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                },
              },
            );
          }

          return baseOptions.fetch!(input, init);
        },
      }),
    );

    await expect(
      Effect.runPromise(keycloak.validateIdentityToken({ idToken })),
    ).resolves.toEqual({
      actorId: "usr_platform_operator_1",
      actorType: actorType.platformOperator,
      realm: baseOptions.realm,
      tenantHint: "org_1",
    });
  });

  it("rejects Keycloak identity tokens whose signing key does not match the issuer JWKS", async () => {
    const baseOptions = createKeycloakTestOptions();
    const issuer = `${baseOptions.baseUrl}/realms/${baseOptions.realm}`;
    const certsEndpoint = `${issuer}/protocol/openid-connect/certs`;
    const idToken = createSignedKeycloakIdentityToken({
      issuer,
      audience: baseOptions.clientId,
      subject: "usr_platform_operator_1",
      actorTypeValue: actorType.platformOperator,
      keyId: "unexpected-key-id",
    });
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter({
        ...baseOptions,
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url === certsEndpoint) {
            return new Response(
              JSON.stringify({ keys: [keycloakIdentityTokenTestPublicJwk] }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                },
              },
            );
          }

          return baseOptions.fetch!(input, init);
        },
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(keycloak.validateIdentityToken({ idToken })),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "KeycloakSessionInactiveError",
        realm: baseOptions.realm,
      },
    });
  });

  it("rejects Keycloak identity tokens that advertise an unsupported signing algorithm", async () => {
    const baseOptions = createKeycloakTestOptions();
    const issuer = `${baseOptions.baseUrl}/realms/${baseOptions.realm}`;
    const idToken = createSignedKeycloakIdentityToken({
      issuer,
      audience: baseOptions.clientId,
      subject: "usr_platform_operator_1",
      actorTypeValue: actorType.platformOperator,
      algorithm: "HS256",
    });
    const keycloak = await Effect.runPromise(makeKeycloakAdapter(baseOptions));

    const result = await Effect.runPromise(
      Effect.either(keycloak.validateIdentityToken({ idToken })),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "KeycloakSessionInactiveError",
        realm: baseOptions.realm,
      },
    });
  });

  it("surfaces identity-token verification dependency failures when signing keys cannot be read", async () => {
    const baseOptions = createKeycloakTestOptions();
    const issuer = `${baseOptions.baseUrl}/realms/${baseOptions.realm}`;
    const certsEndpoint = `${issuer}/protocol/openid-connect/certs`;
    const idToken = createSignedKeycloakIdentityToken({
      issuer,
      audience: baseOptions.clientId,
      subject: "usr_platform_operator_1",
      actorTypeValue: actorType.platformOperator,
    });
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter({
        ...baseOptions,
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url === certsEndpoint) {
            return new Response("Keycloak unavailable", {
              status: 503,
              statusText: "Service Unavailable",
            });
          }

          return baseOptions.fetch!(input, init);
        },
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(keycloak.validateIdentityToken({ idToken })),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "KeycloakAdapterRequestError",
        operation: "tokenVerification",
        status: 503,
      },
    });
  });

  it("surfaces identity-token verification dependency failures when the issuer JWK cannot be imported", async () => {
    const baseOptions = createKeycloakTestOptions();
    const issuer = `${baseOptions.baseUrl}/realms/${baseOptions.realm}`;
    const certsEndpoint = `${issuer}/protocol/openid-connect/certs`;
    const idToken = createSignedKeycloakIdentityToken({
      issuer,
      audience: baseOptions.clientId,
      subject: "usr_platform_operator_1",
      actorTypeValue: actorType.platformOperator,
    });
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter({
        ...baseOptions,
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url === certsEndpoint) {
            return new Response(
              JSON.stringify({ keys: [keycloakIdentityTokenTestPublicJwk] }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                },
              },
            );
          }

          return baseOptions.fetch!(input, init);
        },
      }),
    );
    const importKeySpy = vi
      .spyOn(globalThis.crypto.subtle, "importKey")
      .mockRejectedValueOnce(new Error("Failed to import JWK"));

    const result = await Effect.runPromise(
      Effect.either(keycloak.validateIdentityToken({ idToken })),
    );

    importKeySpy.mockRestore();

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "KeycloakAdapterRequestError",
        operation: "tokenVerification",
      },
    });
  });

  it("lists Ory Keto tuples across paginated responses", async () => {
    const baseOptions = createOryKetoTestOptions();
    const baseFetch = baseOptions.fetch ?? fetch;
    const keto = await Effect.runPromise(
      makeOryKetoAdapter({
        ...baseOptions,
        fetch: async (input, init) => {
          const url = new URL(
            typeof input === "string" ? input : input.toString(),
          );

          if (url.pathname === "/relation-tuples") {
            expect(url.searchParams.get("page_size")).toBe("1000");

            const relationTuples =
              url.searchParams.get("page_token") === "page-2"
                ? [
                    {
                      namespace: authorizationNamespace.tenant,
                      object: "org_1",
                      relation: authorizationRelation.viewer,
                      subject_id: "usr_member_2",
                    },
                  ]
                : [
                    {
                      namespace: authorizationNamespace.tenant,
                      object: "org_1",
                      relation: authorizationRelation.viewer,
                      subject_id: "usr_member_1",
                    },
                  ];

            return new Response(
              JSON.stringify({
                ...(url.searchParams.get("page_token") === null
                  ? { next_page_token: "page-2" }
                  : {}),
                relation_tuples: relationTuples,
              }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                },
              },
            );
          }

          return baseFetch(input, init);
        },
      }),
    );

    await expect(
      Effect.runPromise(
        keto.listTuples({
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.viewer,
        }),
      ),
    ).resolves.toEqual([
      {
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        subject: "usr_member_1",
      },
      {
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        subject: "usr_member_2",
      },
    ]);
  });

  it("treats empty Ory Keto next-page tokens as the end of pagination", async () => {
    const baseOptions = createOryKetoTestOptions();
    const baseFetch = baseOptions.fetch ?? fetch;
    const keto = await Effect.runPromise(
      makeOryKetoAdapter({
        ...baseOptions,
        fetch: async (input, init) => {
          const url = new URL(
            typeof input === "string" ? input : input.toString(),
          );

          if (url.pathname === "/relation-tuples") {
            return new Response(
              JSON.stringify({
                next_page_token: "",
                relation_tuples: [
                  {
                    namespace: authorizationNamespace.tenant,
                    object: "org_1",
                    relation: authorizationRelation.viewer,
                    subject_id: "usr_member_1",
                  },
                ],
              }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                },
              },
            );
          }

          return baseFetch(input, init);
        },
      }),
    );

    await expect(
      Effect.runPromise(
        keto.listTuples({
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.viewer,
        }),
      ),
    ).resolves.toEqual([
      {
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        subject: "usr_member_1",
      },
    ]);
  });

  it("revokes malformed token-exchange sessions when session state is available", async () => {
    const baseOptions = createKeycloakTestOptions();
    const tokenEndpoint = `${baseOptions.baseUrl}/realms/${baseOptions.realm}/protocol/openid-connect/token`;
    const revokedSessionIds: string[] = [];
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter({
        ...baseOptions,
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (
            init?.method === "DELETE" &&
            url.startsWith(
              `${baseOptions.baseUrl}/admin/realms/${baseOptions.realm}/sessions/`,
            )
          ) {
            revokedSessionIds.push(url.split("/").pop() ?? "");
          }

          if (url === tokenEndpoint) {
            const requestBody = new URLSearchParams(String(init?.body ?? ""));

            if (
              requestBody.get("grant_type") ===
                "urn:ietf:params:oauth:grant-type:token-exchange" &&
              requestBody.get("requested_subject") === "usr_member_1"
            ) {
              return new Response(
                '{"access_token":"access-token:usr_member_1","session_state":"sess_impersonation_usr_member_1"',
                {
                  status: 200,
                  headers: {
                    "Content-Type": "application/json",
                  },
                },
              );
            }
          }

          return baseOptions.fetch!(input, init);
        },
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        keycloak.issueImpersonationSession({
          impersonatedActorId: "usr_member_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "KeycloakAdapterRequestError",
        operation: "tokenExchange",
      },
    });
    expect(revokedSessionIds).toEqual(["sess_impersonation_usr_member_1"]);
  });

  it("revokes issued impersonation sessions when Keycloak returns the wrong actor", async () => {
    const baseOptions = createKeycloakTestOptions();
    const introspectionEndpoint = `${baseOptions.baseUrl}/realms/${baseOptions.realm}/protocol/openid-connect/token/introspect`;
    const revokedSessionIds: string[] = [];
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter({
        ...baseOptions,
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (
            init?.method === "DELETE" &&
            url.startsWith(
              `${baseOptions.baseUrl}/admin/realms/${baseOptions.realm}/sessions/`,
            )
          ) {
            revokedSessionIds.push(url.split("/").pop() ?? "");
          }

          if (url === introspectionEndpoint) {
            const requestBody = new URLSearchParams(String(init?.body ?? ""));

            if (requestBody.get("token") === "access-token:usr_member_1") {
              return new Response(
                JSON.stringify({
                  active: true,
                  sub: "usr_member_2",
                  sid: "sess_impersonation_usr_member_2",
                  iss: `${baseOptions.baseUrl}/realms/${baseOptions.realm}`,
                  tenant_hint: "org_1",
                  actor_type: actorType.organizationMember,
                }),
                {
                  status: 200,
                  headers: {
                    "Content-Type": "application/json",
                  },
                },
              );
            }
          }

          return baseOptions.fetch!(input, init);
        },
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        keycloak.issueImpersonationSession({
          impersonatedActorId: "usr_member_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "KeycloakImpersonationActorMismatchError",
        requestedActorId: "usr_member_1",
        sessionActorId: "usr_member_2",
      },
    });
    expect(revokedSessionIds).toEqual(["sess_impersonation_usr_member_2"]);
  });

  it("revokes issued impersonation sessions when introspection omits the session identifier", async () => {
    const baseOptions = createKeycloakTestOptions();
    const introspectionEndpoint = `${baseOptions.baseUrl}/realms/${baseOptions.realm}/protocol/openid-connect/token/introspect`;
    const revokedSessionIds: string[] = [];
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter({
        ...baseOptions,
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (
            init?.method === "DELETE" &&
            url.startsWith(
              `${baseOptions.baseUrl}/admin/realms/${baseOptions.realm}/sessions/`,
            )
          ) {
            revokedSessionIds.push(url.split("/").pop() ?? "");
          }

          if (url === introspectionEndpoint) {
            const requestBody = new URLSearchParams(String(init?.body ?? ""));

            if (requestBody.get("token") === "access-token:usr_member_1") {
              return new Response(
                JSON.stringify({
                  active: true,
                  sub: "usr_member_1",
                  iss: `${baseOptions.baseUrl}/realms/${baseOptions.realm}`,
                  tenant_hint: "org_1",
                  actor_type: actorType.organizationMember,
                }),
                {
                  status: 200,
                  headers: {
                    "Content-Type": "application/json",
                  },
                },
              );
            }
          }

          return baseOptions.fetch!(input, init);
        },
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        keycloak.issueImpersonationSession({
          impersonatedActorId: "usr_member_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "KeycloakSessionIdentifierMissingError",
        actorId: "usr_member_1",
      },
    });
    expect(revokedSessionIds).toEqual(["sess_impersonation_usr_member_1"]);
  });

  it("falls back to the exchanged access token when Keycloak omits id_token", async () => {
    const baseOptions = createKeycloakTestOptions();
    const tokenEndpoint = `${baseOptions.baseUrl}/realms/${baseOptions.realm}/protocol/openid-connect/token`;
    const revokedSessionIds: string[] = [];
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter({
        ...baseOptions,
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url === tokenEndpoint) {
            const requestBody = new URLSearchParams(String(init?.body ?? ""));

            if (
              requestBody.get("grant_type") ===
                "urn:ietf:params:oauth:grant-type:token-exchange" &&
              requestBody.get("requested_subject") === "usr_member_1"
            ) {
              return new Response(
                JSON.stringify({
                  access_token: "access-token:usr_member_1",
                  expires_in: 1800,
                }),
                {
                  status: 200,
                  headers: {
                    "Content-Type": "application/json",
                  },
                },
              );
            }
          }

          if (
            init?.method === "DELETE" &&
            url.startsWith(
              `${baseOptions.baseUrl}/admin/realms/${baseOptions.realm}/sessions/`,
            )
          ) {
            revokedSessionIds.push(url.split("/").pop() ?? "");
            return new Response("Keycloak unavailable", {
              status: 503,
              statusText: "Service Unavailable",
            });
          }

          return baseOptions.fetch!(input, init);
        },
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        keycloak.issueImpersonationSession({
          impersonatedActorId: "usr_member_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Right",
      right: {
        idToken: "access-token:usr_member_1",
        expiresInSeconds: 1800,
        session: {
          actorId: "usr_member_1",
          sessionId: "sess_impersonation_usr_member_1",
        },
      },
    });
    expect(revokedSessionIds).toEqual([]);
  });

  it("surfaces cleanup-unavailable failures when no impersonation session identifier is available", async () => {
    const baseOptions = createKeycloakTestOptions();
    const tokenEndpoint = `${baseOptions.baseUrl}/realms/${baseOptions.realm}/protocol/openid-connect/token`;
    const introspectionEndpoint = `${baseOptions.baseUrl}/realms/${baseOptions.realm}/protocol/openid-connect/token/introspect`;
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter({
        ...baseOptions,
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url === tokenEndpoint) {
            const requestBody = new URLSearchParams(String(init?.body ?? ""));

            if (
              requestBody.get("grant_type") ===
                "urn:ietf:params:oauth:grant-type:token-exchange" &&
              requestBody.get("requested_subject") === "usr_member_1"
            ) {
              return new Response(
                JSON.stringify({
                  access_token: "access-token:usr_member_1",
                  id_token: "id-token:usr_member_1",
                  expires_in: 1800,
                }),
                {
                  status: 200,
                  headers: {
                    "Content-Type": "application/json",
                  },
                },
              );
            }
          }

          if (url === introspectionEndpoint) {
            const requestBody = new URLSearchParams(String(init?.body ?? ""));

            if (requestBody.get("token") === "access-token:usr_member_1") {
              return new Response(
                JSON.stringify({
                  active: true,
                  sub: "usr_member_1",
                  iss: `${baseOptions.baseUrl}/realms/${baseOptions.realm}`,
                  tenant_hint: "org_1",
                  actor_type: actorType.organizationMember,
                }),
                {
                  status: 200,
                  headers: {
                    "Content-Type": "application/json",
                  },
                },
              );
            }
          }

          return baseOptions.fetch!(input, init);
        },
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        keycloak.issueImpersonationSession({
          impersonatedActorId: "usr_member_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "KeycloakImpersonationCleanupUnavailableError",
        issuanceFailure: {
          _tag: "KeycloakSessionIdentifierMissingError",
          actorId: "usr_member_1",
        },
      },
    });
  });

  it("returns none when a Keycloak realm role is not found", async () => {
    const baseOptions = createKeycloakTestOptions({
      adminUsername: "admin",
      adminPassword: "password",
    });
    const adminTokenEndpoint = `${baseOptions.baseUrl}/realms/master/protocol/openid-connect/token`;
    const missingRolePath = `/admin/realms/${baseOptions.realm}/roles-by-id/kc-role-missing`;
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter({
        ...baseOptions,
        adminUsername: "admin",
        adminPassword: "password",
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();
          const requestUrl = new URL(url);

          if (url === adminTokenEndpoint) {
            return createJsonTestResponse({
              access_token: "admin-access-token",
              expires_in: 1800,
            });
          }

          if (requestUrl.pathname === missingRolePath) {
            return new Response("Not Found", {
              status: 404,
              statusText: "Not Found",
            });
          }

          return baseOptions.fetch!(input, init);
        },
      }),
    );

    const result = await Effect.runPromise(
      keycloak.readRealmRoleById({
        roleId: "kc-role-missing",
      }),
    );

    expect(result).toMatchObject({
      _tag: "None",
    });
  });

  it("reads Keycloak realm role detail with composite roles and paginated members", async () => {
    const baseOptions = createKeycloakTestOptions({
      adminUsername: "admin",
      adminPassword: "password",
    });
    const adminTokenEndpoint = `${baseOptions.baseUrl}/realms/master/protocol/openid-connect/token`;
    const rolePath = `/admin/realms/${baseOptions.realm}/roles-by-id/kc-role-001`;
    const firstPageMembers = Array.from({ length: 100 }, (_, index) => ({
      id: `usr_${index}`,
      username: `member-${index}`,
      ...(index === 0 ? { email: "member-0@example.test" } : {}),
      enabled: index % 2 === 0,
    }));
    const secondPageMembers = [
      {
        id: "usr_100",
        username: "member-100",
        enabled: true,
      },
    ];
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter({
        ...baseOptions,
        adminUsername: "admin",
        adminPassword: "password",
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();
          const requestUrl = new URL(url);

          if (url === adminTokenEndpoint) {
            return createJsonTestResponse({
              access_token: "admin-access-token",
              expires_in: 1800,
            });
          }

          if (requestUrl.pathname === rolePath) {
            return createJsonTestResponse({
              id: "kc-role-001",
              name: "tenant-admin",
              description: "Tenant administrators",
              composite: true,
              clientRole: false,
            });
          }

          if (requestUrl.pathname === `${rolePath}/composites`) {
            return createJsonTestResponse([
              {
                id: "kc-role-002",
                name: "tenant-support",
                composite: false,
                clientRole: false,
              },
            ]);
          }

          if (requestUrl.pathname === `${rolePath}/users`) {
            if (requestUrl.searchParams.get("first") === "0") {
              return createJsonTestResponse(firstPageMembers);
            }

            if (requestUrl.searchParams.get("first") === "100") {
              return createJsonTestResponse(secondPageMembers);
            }
          }

          return baseOptions.fetch!(input, init);
        },
      }),
    );

    const result = await Effect.runPromise(
      keycloak.readRealmRoleById({
        roleId: "kc-role-001",
      }),
    );

    expect(result).toMatchObject({
      _tag: "Some",
      value: {
        roleId: "kc-role-001",
        roleName: "tenant-admin",
        description: "Tenant administrators",
        composite: true,
        clientRole: false,
        realm: baseOptions.realm,
        compositeRoles: [
          {
            roleId: "kc-role-002",
            roleName: "tenant-support",
            composite: false,
            clientRole: false,
          },
        ],
      },
    });
    if (result._tag === "Some") {
      expect(result.value.members).toHaveLength(101);
      expect(result.value.members[0]).toMatchObject({
        userId: "usr_0",
        username: "member-0",
        email: "member-0@example.test",
        enabled: true,
      });
      expect(result.value.members[100]).toMatchObject({
        userId: "usr_100",
        username: "member-100",
        enabled: true,
      });
    }
  });

  it("surfaces composite-role fetch failures during Keycloak realm role reads", async () => {
    const baseOptions = createKeycloakTestOptions({
      adminUsername: "admin",
      adminPassword: "password",
    });
    const adminTokenEndpoint = `${baseOptions.baseUrl}/realms/master/protocol/openid-connect/token`;
    const rolePath = `/admin/realms/${baseOptions.realm}/roles-by-id/kc-role-001`;
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter({
        ...baseOptions,
        adminUsername: "admin",
        adminPassword: "password",
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();
          const requestUrl = new URL(url);

          if (url === adminTokenEndpoint) {
            return createJsonTestResponse({
              access_token: "admin-access-token",
              expires_in: 1800,
            });
          }

          if (requestUrl.pathname === rolePath) {
            return createJsonTestResponse({
              id: "kc-role-001",
              name: "tenant-admin",
              composite: true,
              clientRole: false,
            });
          }

          if (requestUrl.pathname === `${rolePath}/composites`) {
            return new Response("Service Unavailable", {
              status: 503,
              statusText: "Service Unavailable",
            });
          }

          return baseOptions.fetch!(input, init);
        },
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        keycloak.readRealmRoleById({
          roleId: "kc-role-001",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "KeycloakAdapterRequestError",
        operation: "listAdminRoleComposites",
        status: 503,
      },
    });
  });

  it("surfaces member-enumeration failures during Keycloak realm role reads", async () => {
    const baseOptions = createKeycloakTestOptions({
      adminUsername: "admin",
      adminPassword: "password",
    });
    const adminTokenEndpoint = `${baseOptions.baseUrl}/realms/master/protocol/openid-connect/token`;
    const rolePath = `/admin/realms/${baseOptions.realm}/roles-by-id/kc-role-001`;
    const keycloak = await Effect.runPromise(
      makeKeycloakAdapter({
        ...baseOptions,
        adminUsername: "admin",
        adminPassword: "password",
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();
          const requestUrl = new URL(url);

          if (url === adminTokenEndpoint) {
            return createJsonTestResponse({
              access_token: "admin-access-token",
              expires_in: 1800,
            });
          }

          if (requestUrl.pathname === rolePath) {
            return createJsonTestResponse({
              id: "kc-role-001",
              name: "tenant-admin",
              composite: true,
              clientRole: false,
            });
          }

          if (requestUrl.pathname === `${rolePath}/composites`) {
            return createJsonTestResponse([]);
          }

          if (requestUrl.pathname === `${rolePath}/users`) {
            return new Response("Service Unavailable", {
              status: 503,
              statusText: "Service Unavailable",
            });
          }

          return baseOptions.fetch!(input, init);
        },
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        keycloak.readRealmRoleById({
          roleId: "kc-role-001",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "KeycloakAdapterRequestError",
        operation: "listAdminRoleMembers",
        status: 503,
      },
    });
  });

  it("creates healthy adapters for all new services", async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: {
      readonly url: string;
      readonly method: string;
      readonly body?: string;
    }[] = [];
    const persistedAuthorizationSubject = `actor-type:${actorType.organizationMember}`;
    globalThis.fetch = async (input, init) => {
      const body =
        typeof init?.body === "string" ? init.body : init?.body?.toString();

      fetchCalls.push({
        url: typeof input === "string" ? input : input.toString(),
        method: init?.method ?? "GET",
        ...(body === undefined ? {} : { body }),
      });

      return new Response(null, { status: 202 });
    };

    try {
      const valkey = await Effect.runPromise(
        makeValkeyAdapter({
          url: "redis://localhost:6379",
          client: createValkeyTestClient(),
        }),
      );
      const keto = await Effect.runPromise(
        makeOryKetoAdapter(createOryKetoTestOptions()),
      );
      const unleash = await Effect.runPromise(
        makeUnleashAdapter({
          url: "http://localhost:4242",
          apiKey: "test-api-key",
          client: createUnleashTestClient([]),
          fetch: async () =>
            new Response(
              JSON.stringify({
                version: 2,
                features: [],
              }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                },
              },
            ),
        }),
      );
      const glitchtip = await Effect.runPromise(
        makeGlitchtipAdapter({ dsn: "https://glitchtip.local/api/1/store/" }),
      );
      const observability = await Effect.runPromise(
        makeObservabilityAdapter({
          otlpHttpEndpoint: "http://localhost:4318",
          grafanaBaseUrl: "http://localhost:3001",
        }),
      );
      const openpanel = await Effect.runPromise(
        makeOpenPanelAdapter({
          clientId: "client_demo",
          clientSecret: "client_secret_demo",
          apiUrl: "http://localhost:3005/api",
          fetch: async () => new Response(null, { status: 200 }),
        }),
      );
      const novuFetchCalls: Array<{
        readonly url: string;
        readonly method: string;
        readonly body?: string;
      }> = [];
      const novu = await Effect.runPromise(
        makeNovuAdapter({
          apiKey: "novu-key",
          apiUrl: "http://localhost:3101",
          fetch: async (input, init) => {
            const url = typeof input === "string" ? input : input.toString();
            const method = init?.method ?? "GET";
            const body = typeof init?.body === "string" ? init.body : undefined;

            novuFetchCalls.push({ url, method, ...(body ? { body } : {}) });

            if (url === "http://localhost:3101/v1/environments/me") {
              return new Response(JSON.stringify({ data: { _id: "env_1" } }), {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                },
              });
            }

            if (url === "http://localhost:3101/v1/events/trigger") {
              return new Response(
                JSON.stringify({
                  data: {
                    acknowledged: true,
                    status: "processed",
                    transactionId: "novu_tx_1",
                  },
                }),
                {
                  status: 201,
                  headers: {
                    "Content-Type": "application/json",
                  },
                },
              );
            }

            return new Response("Not found", { status: 404 });
          },
        }),
      );
      const meilisearch = await Effect.runPromise(
        makeMeilisearchAdapter({
          url: "http://localhost:7700",
          apiKey: "meili-master-key",
        }),
      );
      const polar = await Effect.runPromise(
        makePolarAdapter(createPolarTestOptions()),
      );
      const openmeter = await Effect.runPromise(
        makeOpenmeterAdapter({
          url: "http://localhost:8889",
          apiKey: "openmeter-key",
          fetch: async (input, init) => {
            const url = typeof input === "string" ? input : input.toString();

            if (url === "http://localhost:8889/api/v1/debug/metrics") {
              return new Response("ok", {
                status: 200,
              });
            }

            if (url === "http://localhost:8889/api/v1/ingest") {
              return new Response(null, { status: 202 });
            }

            return new Response("Not found", { status: 404 });
          },
        }),
      );
      const postalFetchCalls: Array<{
        readonly url: string;
        readonly method: string;
      }> = [];
      const postal = await Effect.runPromise(
        makePostalAdapter({
          apiUrl: "http://localhost:5000",
          apiKey: "postal-key",
          fetch: async (input, init) => {
            const url = typeof input === "string" ? input : input.toString();
            const method = init?.method ?? "GET";
            const body = typeof init?.body === "string" ? init.body : undefined;

            postalFetchCalls.push({ url, method });

            if (
              url === "http://localhost:5000/api/v1/send/message" &&
              body === "{}"
            ) {
              return new Response(
                JSON.stringify({
                  status: "error",
                  data: {
                    code: "NoRecipients",
                  },
                }),
                {
                  status: 200,
                  headers: {
                    "Content-Type": "application/json",
                  },
                },
              );
            }

            return new Response(
              JSON.stringify({
                status: "success",
                data: {
                  message_id: "postal-message-id@example.test",
                },
              }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                },
              },
            );
          },
        }),
      );

      await expect(
        Effect.runPromise(valkey.healthcheck),
      ).resolves.toMatchObject({
        healthy: true,
      });
      await expect(
        Effect.runPromise(
          valkey.incrementCounter({ key: "quota:org_1", incrementBy: 1 }),
        ),
      ).resolves.toMatchObject({ key: "quota:org_1", value: 1 });
      await expect(
        Effect.runPromise(
          valkey.writeSession({
            sessionId: "sess_1",
            requestContext: {
              actorType: actorType.organizationMember,
              actorId: "usr_1",
              sessionId: "sess_1",
              correlationId: "corr_1",
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_1",
                enterpriseId: "ent_1",
                organizationId: "org_1",
                individualId: "usr_1",
              },
            },
          }),
        ),
      ).resolves.toMatchObject({ sessionId: "sess_1" });
      await expect(
        Effect.runPromise(valkey.readSession({ sessionId: "sess_1" })),
      ).resolves.toMatchObject({
        requestContext: {
          actorId: "usr_1",
          tenant: { scopeId: "org_1" },
        },
      });
      await expect(
        Effect.runPromise(
          keto.writeTuple({
            namespace: authorizationNamespace.tenant,
            object: "org_1",
            relation: authorizationRelation.viewer,
            subject: persistedAuthorizationSubject,
          }),
        ),
      ).resolves.toMatchObject({
        namespace: authorizationNamespace.tenant,
        object: "org_1",
      });
      await expect(Effect.runPromise(keto.healthcheck)).resolves.toMatchObject({
        healthy: true,
      });
      await expect(
        Effect.runPromise(
          keto.check({
            namespace: authorizationNamespace.tenant,
            object: "org_1",
            relation: authorizationRelation.viewer,
            subject: persistedAuthorizationSubject,
          }),
        ),
      ).resolves.toMatchObject({ allowed: true });
      await expect(
        Effect.runPromise(
          keto.listTuples({
            namespace: authorizationNamespace.tenant,
            object: "org_1",
            relation: authorizationRelation.viewer,
            subject: persistedAuthorizationSubject,
          }),
        ),
      ).resolves.toEqual([
        {
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.viewer,
          subject: persistedAuthorizationSubject,
        },
      ]);
      await expect(
        Effect.runPromise(unleash.healthcheck),
      ).resolves.toMatchObject({ healthy: true });
      await expect(
        Effect.runPromise(
          unleash.evaluateFeatureFlag({
            flagKey: `${platformModuleId.tenantBranding}.enabled`,
            fallbackEnabled: false,
            context: {
              userId: "usr_1",
              sessionId: "sess_1",
              properties: {
                scope: platformScope.organization,
                scopeId: "org_1",
              },
            },
          }),
        ),
      ).resolves.toEqual({
        flagKey: `${platformModuleId.tenantBranding}.enabled`,
        enabled: false,
        definitionExists: false,
      });
      await expect(
        Effect.runPromise(glitchtip.healthcheck),
      ).resolves.toMatchObject({ healthy: true });
      await expect(
        Effect.runPromise(
          glitchtip.captureException({
            service: "platform",
            correlationId: "corr_1",
            method: "POST",
            path: "/api/example",
            status: 500,
            durationMs: 12,
            errorName: "Error",
            errorMessage: "adapter boom",
          }),
        ),
      ).resolves.toMatchObject({
        correlationId: "corr_1",
        path: "/api/example",
      });
      await expect(
        Effect.runPromise(openpanel.healthcheck),
      ).resolves.toMatchObject({ healthy: true });
      await expect(
        Effect.runPromise(
          observability.emit({
            kind: telemetryKind.trace,
            service: "platform",
            payload: { correlationId: "corr_1" },
          }),
        ),
      ).resolves.toMatchObject({
        kind: telemetryKind.trace,
        service: "platform",
      });
      await expect(
        Effect.runPromise(
          observability.emit({
            kind: telemetryKind.audit,
            service: "platform",
            payload: { correlationId: "corr_2" },
          }),
        ),
      ).resolves.toMatchObject({
        kind: telemetryKind.audit,
        service: "platform",
      });
      expect(fetchCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            url: "https://glitchtip.local/api/1/store/",
            method: "POST",
            body: expect.stringContaining("adapter boom"),
          }),
          expect.objectContaining({
            url: "http://localhost:4318/v1/traces",
            method: "POST",
          }),
          expect.objectContaining({
            url: "http://localhost:4318/v1/logs",
            method: "POST",
          }),
        ]),
      );
      await expect(Effect.runPromise(novu.healthcheck)).resolves.toMatchObject({
        healthy: true,
      });
      await expect(
        Effect.runPromise(
          novu.triggerNotification({
            channel: "email",
            recipient: "customer@example.com",
            template: "billing.invoice-ready",
            subject: "Your invoice is ready",
          }),
        ),
      ).resolves.toMatchObject({
        channel: "email",
        recipient: "customer@example.com",
        template: "billing.invoice-ready",
        status: "queued",
        provider: platformAdapterServiceName.novu,
        id: "novu_tx_1",
      });
      expect(novuFetchCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            url: "http://localhost:3101/v1/environments/me",
            method: "GET",
          }),
          expect.objectContaining({
            url: "http://localhost:3101/v1/events/trigger",
            method: "POST",
            body: expect.stringContaining("billing-invoice-ready"),
          }),
        ]),
      );
      await expect(
        Effect.runPromise(meilisearch.healthcheck),
      ).resolves.toMatchObject({ healthy: true });
      await expect(Effect.runPromise(polar.healthcheck)).resolves.toMatchObject(
        {
          healthy: true,
        },
      );
      await expect(Effect.runPromise(polar.listPlans)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            planId: "plan_starter",
            prices: expect.arrayContaining([
              expect.objectContaining({ interval: billingPlanInterval.month }),
              expect.objectContaining({ interval: billingPlanInterval.year }),
            ]),
          }),
        ]),
      );
      await expect(
        Effect.runPromise(
          polar.createCheckoutSession({
            planId: "plan_starter",
            priceId: "price_starter_year",
            successUrl: "http://localhost:3002/billing/success",
            cancelUrl: "http://localhost:3002/billing/cancel",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
          }),
        ),
      ).resolves.toMatchObject({
        planId: "plan_starter",
        priceId: "price_starter_year",
        interval: billingPlanInterval.year,
        provider: platformAdapterServiceName.polar,
      });
      await expect(
        Effect.runPromise(
          polar.createManagedBillingPlan({
            planKey: "scale",
            displayName: "Scale",
            description: "Operator-created recurring plan.",
            visibility: billingPlanVisibility.draft,
            price: {
              interval: billingPlanInterval.month,
              currency: "USD",
              amountMinor: 4900,
            },
            entitlements: [
              {
                moduleId: platformModuleId.tenantManagement,
                included: true,
                meteringMode: billingMeteringMode.none,
                enforcementMode: billingEnforcementMode.none,
              },
            ],
          }),
        ),
      ).resolves.toMatchObject({
        plan: expect.objectContaining({
          planKey: "scale",
          displayName: "Scale",
          prices: [
            expect.objectContaining({
              interval: billingPlanInterval.month,
              amountMinor: 4900,
            }),
          ],
        }),
        visibility: billingPlanVisibility.draft,
        provider: platformAdapterServiceName.polar,
      });
      await expect(
        Effect.runPromise(openmeter.healthcheck),
      ).resolves.toMatchObject({ healthy: true });
      await expect(
        Effect.runPromise(
          openmeter.ingestUsage({
            subject: "org_1",
            eventName: "custom-domain.created",
            quantity: 1,
            capturedAt: new Date().toISOString(),
          }),
        ),
      ).resolves.toMatchObject({ eventName: "custom-domain.created" });
      await expect(
        Effect.runPromise(postal.healthcheck),
      ).resolves.toMatchObject({
        healthy: true,
      });
      await expect(
        Effect.runPromise(
          postal.sendEmail({
            messageId: "email-delivery:platform:platform:adapter-test",
            recipient: "customer@example.com",
            subject: "Welcome",
            html: "<p>Hello</p>",
            fromEmail: "support@platform.example",
            fromName: "Comvestec Platform",
            replyToEmail: "reply@platform.example",
          }),
        ),
      ).resolves.toMatchObject({
        messageId: "email-delivery:platform:platform:adapter-test",
        recipient: "customer@example.com",
        status: "queued",
        provider: platformAdapterServiceName.postal,
      });
      expect(postalFetchCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            url: "http://localhost:5000/api/v1/send/message",
            method: "POST",
          }),
          expect.objectContaining({
            url: "http://localhost:5000/api/v1/send/message",
            method: "POST",
          }),
        ]),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("surfaces Postal API send failures as typed adapter errors", async () => {
    const postal = await Effect.runPromise(
      makePostalAdapter({
        apiUrl: "http://localhost:5000",
        apiKey: "postal-key",
        fetch: async () =>
          new Response(
            JSON.stringify({
              status: "error",
              data: {
                code: "AccessDenied",
                message: "The provided server API key is invalid.",
              },
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        postal.sendEmail({
          messageId: "email-delivery:platform:platform:adapter-test",
          recipient: "customer@example.com",
          subject: "Welcome",
          html: "<p>Hello</p>",
          fromEmail: "support@platform.example",
          fromName: "Comvestec Platform",
          replyToEmail: "reply@platform.example",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "PostalAdapterRequestError",
        operation: "sendEmail",
        status: 200,
      },
    });
  });

  it("surfaces Novu trigger failures as typed adapter errors", async () => {
    const novu = await Effect.runPromise(
      makeNovuAdapter({
        apiUrl: "http://localhost:3101",
        apiKey: "novu-key",
        fetch: async (input) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url === "http://localhost:3101/v1/events/trigger") {
            return new Response("Novu unavailable", { status: 503 });
          }

          return new Response(null, { status: 200 });
        },
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        novu.triggerNotification({
          channel: "email",
          recipient: "customer@example.com",
          template: "billing.invoice-ready",
          subject: "Your invoice is ready",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "NovuAdapterRequestError",
        operation: "triggerNotification",
        status: 503,
      },
    });
  });

  it("surfaces Novu authenticated healthcheck failures as typed adapter errors", async () => {
    const novu = await Effect.runPromise(
      makeNovuAdapter({
        apiUrl: "http://localhost:3101",
        apiKey: "novu-key",
        fetch: async (input) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url === "http://localhost:3101/v1/environments/me") {
            return new Response("API Key not found", { status: 401 });
          }

          return new Response("Not found", { status: 404 });
        },
      }),
    );
    const result = await Effect.runPromise(Effect.either(novu.healthcheck));

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "NovuAdapterRequestError",
        operation: "healthcheck",
        status: 401,
      },
    });
  });

  it("lists Novu messages with delivery query filters", async () => {
    const requests: Array<{ readonly url: string; readonly method: string }> =
      [];
    const novu = await Effect.runPromise(
      makeNovuAdapter({
        apiUrl: "http://localhost:3101",
        apiKey: "novu-key",
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();
          const method = init?.method ?? "GET";

          requests.push({ url, method });

          if (url.startsWith("http://localhost:3101/v1/messages")) {
            return new Response(
              JSON.stringify({
                hasMore: false,
                pageSize: 1,
                page: 2,
                totalCount: 1,
                data: [
                  {
                    _id: "msg_1",
                    _notificationId: "evt_1",
                    _subscriberId: "sub_1",
                    templateIdentifier: "billing-invoice-ready",
                    createdAt: "2026-06-01T10:00:00.000Z",
                    deliveredAt: ["2026-06-01T10:01:00.000Z"],
                    transactionId: "tx_1",
                    subject: "Invoice ready",
                    channel: "email",
                    email: "customer@example.com",
                    status: "sent",
                    contextKeys: ["tenantId:org_1"],
                  },
                ],
              }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                },
              },
            );
          }

          return new Response("Not found", { status: 404 });
        },
      }),
    );

    await expect(
      Effect.runPromise(
        novu.listMessages({
          channel: "email",
          subscriberId: "sub_1",
          transactionIds: ["tx_1", "tx_2"],
          contextKeys: ["tenantId:org_1"],
          page: 2,
          limit: 5,
        }),
      ),
    ).resolves.toMatchObject({
      hasMore: false,
      page: 2,
      pageSize: 1,
      totalCount: 1,
      data: [
        expect.objectContaining({
          _id: "msg_1",
          _notificationId: "evt_1",
          _subscriberId: "sub_1",
          channel: "email",
          status: "sent",
        }),
      ],
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "GET",
    });
    const requestUrl = new URL(requests[0]!.url);
    expect(requestUrl.pathname).toBe("/v1/messages");
    expect(requestUrl.searchParams.get("channel")).toBe("email");
    expect(requestUrl.searchParams.get("subscriberId")).toBe("sub_1");
    expect(requestUrl.searchParams.getAll("transactionId")).toEqual([
      "tx_1",
      "tx_2",
    ]);
    expect(requestUrl.searchParams.getAll("contextKeys")).toEqual([
      "tenantId:org_1",
    ]);
    expect(requestUrl.searchParams.get("page")).toBe("2");
    expect(requestUrl.searchParams.get("limit")).toBe("5");
  });

  it("reads Novu notification detail and maps 404s to none", async () => {
    const novu = await Effect.runPromise(
      makeNovuAdapter({
        apiUrl: "http://localhost:3101",
        apiKey: "novu-key",
        fetch: async (input) => {
          const url = typeof input === "string" ? input : input.toString();

          if (url === "http://localhost:3101/v1/notifications/evt_1") {
            return new Response(
              JSON.stringify({
                _id: "evt_1",
                transactionId: "tx_1",
                payload: {
                  invoiceId: "inv_1",
                },
                contextKeys: ["tenantId:org_1"],
                subscriber: {
                  subscriberId: "sub_1",
                  email: "customer@example.com",
                },
                template: {
                  triggers: [{ identifier: "billing-invoice-ready" }],
                },
              }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                },
              },
            );
          }

          if (url === "http://localhost:3101/v1/notifications/evt_missing") {
            return new Response("Not found", { status: 404 });
          }

          return new Response("Not found", { status: 404 });
        },
      }),
    );

    const found = await Effect.runPromise(
      novu.getNotification({ notificationId: "evt_1" }),
    );
    expect(found._tag).toBe("Some");
    if (found._tag === "Some") {
      expect(found.value).toMatchObject({
        _id: "evt_1",
        transactionId: "tx_1",
        contextKeys: ["tenantId:org_1"],
        subscriber: {
          subscriberId: "sub_1",
          email: "customer@example.com",
        },
      });
    }

    const missing = await Effect.runPromise(
      novu.getNotification({ notificationId: "evt_missing" }),
    );
    expect(missing._tag).toBe("None");
  });

  it("triggers generic Novu events and unwraps nested transaction receipts", async () => {
    const requests: Array<{
      readonly url: string;
      readonly method: string;
      readonly body?: string;
    }> = [];
    const novu = await Effect.runPromise(
      makeNovuAdapter({
        apiUrl: "http://localhost:3101",
        apiKey: "novu-key",
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();
          const method = init?.method ?? "GET";
          const body = typeof init?.body === "string" ? init.body : undefined;

          requests.push({
            url,
            method,
            ...(body === undefined ? {} : { body }),
          });

          if (url === "http://localhost:3101/v1/events/trigger") {
            return new Response(
              JSON.stringify({
                data: {
                  acknowledged: true,
                  status: "processed",
                  data: {
                    transactionId: "novu_tx_2",
                  },
                },
              }),
              {
                status: 201,
                headers: {
                  "Content-Type": "application/json",
                },
              },
            );
          }

          return new Response("Not found", { status: 404 });
        },
      }),
    );

    const receipt = await Effect.runPromise(
      novu.triggerEvent({
        name: "billing-invoice-ready",
        to: {
          subscriberId: "sub_1",
          email: "customer@example.com",
        },
        payload: {
          invoiceId: "inv_1",
        },
        overrides: {
          email: {
            subject: "Invoice ready",
          },
        },
        context: {
          tenantId: "org_1",
        },
        transactionId: "tx_source_1-resend",
      }),
    );

    expect(receipt).toMatchObject({
      id: "novu_tx_2",
      provider: platformAdapterServiceName.novu,
    });
    expect(Date.parse(receipt.createdAt)).not.toBeNaN();
    expect(requests[0]).toMatchObject({
      url: "http://localhost:3101/v1/events/trigger",
      method: "POST",
    });
    expect(JSON.parse(requests[0]!.body ?? "{}")).toEqual({
      name: "billing-invoice-ready",
      to: {
        subscriberId: "sub_1",
        email: "customer@example.com",
      },
      payload: {
        invoiceId: "inv_1",
      },
      overrides: {
        email: {
          subject: "Invoice ready",
        },
      },
      context: {
        tenantId: "org_1",
      },
      transactionId: "tx_source_1-resend",
    });
  });

  it("probes the Convex deployment root for health", async () => {
    const requests: Array<{ readonly url: string; readonly method: string }> =
      [];
    const convex = await Effect.runPromise(
      makeConvexAdapter({
        deploymentUrl: "http://127.0.0.1:3210",
        siteUrl: "http://127.0.0.1:3211",
        adminKey: "convex-admin-key",
        keycloakBaseUrl: "http://127.0.0.1:8080",
        keycloakRealm: "comvestec",
        keycloakClientId: "saas-platform",
        keycloakClientSecret: "change-me",
        keycloakConvexServiceActorUsername: "convex.billing.service",
        keycloakConvexServiceActorPassword: "service-secret",
        fetch: async (input, init) => {
          requests.push({
            url: typeof input === "string" ? input : input.toString(),
            method: init?.method ?? "GET",
          });

          return new Response(
            "This Convex deployment is running. See https://docs.convex.dev/.",
            { status: 200 },
          );
        },
      }),
    );

    await expect(Effect.runPromise(convex.healthcheck)).resolves.toEqual({
      healthy: true,
      service: platformAdapterServiceName.convex,
    });
    expect(requests).toEqual([
      {
        url: "http://127.0.0.1:3210/",
        method: "GET",
      },
    ]);
  });

  it("fails the Convex healthcheck when the deployment root is not a running Convex runtime", async () => {
    const convex = await Effect.runPromise(
      makeConvexAdapter({
        deploymentUrl: "http://127.0.0.1:3210",
        siteUrl: "http://127.0.0.1:3211",
        adminKey: "convex-admin-key",
        keycloakBaseUrl: "http://127.0.0.1:8080",
        keycloakRealm: "comvestec",
        keycloakClientId: "saas-platform",
        keycloakClientSecret: "change-me",
        keycloakConvexServiceActorUsername: "convex.billing.service",
        keycloakConvexServiceActorPassword: "service-secret",
        fetch: async () =>
          new Response("Not a Convex deployment", { status: 200 }),
      }),
    );
    const result = await Effect.runPromise(Effect.either(convex.healthcheck));

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "ConvexRuntimeHealthcheckRequestError",
        status: 200,
      },
    });
  });

  it("probes the Unleash client features endpoint with the repo-owned backend identity", async () => {
    const requests: Array<{
      readonly url: string;
      readonly method: string;
      readonly headers: Record<string, string>;
    }> = [];
    const unleash = await Effect.runPromise(
      makeUnleashAdapter({
        url: "http://localhost:4242",
        apiKey: "test-api-key",
        client: createUnleashTestClient([]),
        fetch: async (input, init) => {
          requests.push({
            url: typeof input === "string" ? input : input.toString(),
            method: init?.method ?? "GET",
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
          });

          return new Response(
            JSON.stringify({
              version: 2,
              features: [],
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
        },
      }),
    );

    await expect(Effect.runPromise(unleash.healthcheck)).resolves.toEqual({
      healthy: true,
      service: platformAdapterServiceName.unleash,
    });
    expect(requests).toEqual([
      {
        url: "http://localhost:4242/api/client/features",
        method: "GET",
        headers: expect.objectContaining({
          accept: "application/json",
          authorization: "test-api-key",
          "unleash-appname": unleashBackendClientName,
          "unleash-instanceid": unleashBackendClientName,
        }),
      },
    ]);
  });

  it("surfaces Unleash authenticated healthcheck failures as typed adapter errors", async () => {
    const unleash = await Effect.runPromise(
      makeUnleashAdapter({
        url: "http://localhost:4242",
        apiKey: "test-api-key",
        client: createUnleashTestClient([]),
        fetch: async () => new Response("Token rejected", { status: 401 }),
      }),
    );
    const result = await Effect.runPromise(Effect.either(unleash.healthcheck));

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "UnleashAdapterRequestError",
        operation: "healthcheck",
        status: 401,
      },
    });
  });

  it("falls back to the legacy OpenMeter events endpoint when ingest is unavailable", async () => {
    const requestedEndpoints: string[] = [];
    const openmeter = await Effect.runPromise(
      makeOpenmeterAdapter({
        url: "http://localhost:8889",
        apiKey: "openmeter-key",
        fetch: async (input) => {
          const url = typeof input === "string" ? input : input.toString();

          requestedEndpoints.push(url);

          if (url === "http://localhost:8889/api/v1/ingest") {
            return new Response("Missing endpoint", { status: 404 });
          }

          if (url === "http://localhost:8889/api/v1/events") {
            return new Response(null, { status: 202 });
          }

          return new Response(null, { status: 200 });
        },
      }),
    );

    await expect(
      Effect.runPromise(
        openmeter.ingestUsage({
          subject: "org_1",
          eventName: "custom-domain.created",
          quantity: 1,
          capturedAt: new Date().toISOString(),
        }),
      ),
    ).resolves.toMatchObject({
      subject: "org_1",
      eventName: "custom-domain.created",
    });

    expect(requestedEndpoints).toEqual([
      "http://localhost:8889/api/v1/ingest",
      "http://localhost:8889/api/v1/events",
    ]);
  });

  it("probes the OpenPanel authenticated track boundary through the configured analytics api host", async () => {
    const requests: Array<{
      readonly url: string;
      readonly method: string;
      readonly headers: Record<string, string>;
      readonly body?: string;
    }> = [];
    const openpanel = await Effect.runPromise(
      makeOpenPanelAdapter({
        clientId: "client_demo",
        clientSecret: "client_secret_demo",
        apiUrl: "http://localhost:3005/api",
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

          return new Response(
            JSON.stringify({
              ok: true,
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
        },
      }),
    );

    await expect(Effect.runPromise(openpanel.healthcheck)).resolves.toEqual({
      healthy: true,
      service: platformAdapterServiceName.openpanel,
    });
    expect(requests).toEqual([
      {
        url: "http://localhost:3005/api/track",
        method: "POST",
        headers: expect.objectContaining({
          accept: "application/json",
          "content-type": "application/json",
          "openpanel-client-id": "client_demo",
          "openpanel-client-secret": "client_secret_demo",
        }),
        body: JSON.stringify({
          type: "track",
          payload: {
            name: "platform.openpanel.healthcheck",
            properties: {
              source: "platform-adapter-healthcheck",
            },
            profileId: "platform-openpanel-healthcheck",
          },
        }),
      },
    ]);
  });

  it("tracks OpenPanel business events through the authenticated analytics endpoint", async () => {
    const requests: Array<{
      readonly url: string;
      readonly method: string;
      readonly headers: Record<string, string>;
      readonly body?: string;
    }> = [];
    const openpanel = await Effect.runPromise(
      makeOpenPanelAdapter({
        clientId: "client_demo",
        clientSecret: "client_secret_demo",
        apiUrl: "http://localhost:3005/api",
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
        openpanel.trackEvent({
          name: "search.managed-files.query-previewed",
          profileId: "usr_support_1",
          properties: {
            moduleId: platformModuleId.search,
            queryLength: 7,
          },
        }),
      ),
    ).resolves.toEqual({
      name: "search.managed-files.query-previewed",
      profileId: "usr_support_1",
      properties: {
        moduleId: platformModuleId.search,
        queryLength: 7,
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: "http://localhost:3005/api/track",
      method: "POST",
      headers: expect.objectContaining({
        accept: "application/json",
        "content-type": "application/json",
        "openpanel-client-id": "client_demo",
        "openpanel-client-secret": "client_secret_demo",
      }),
    });
    expect(JSON.parse(requests[0]!.body ?? "null")).toEqual({
      type: "track",
      payload: {
        name: "search.managed-files.query-previewed",
        profileId: "usr_support_1",
        properties: {
          moduleId: platformModuleId.search,
          queryLength: 7,
        },
      },
    });
  });

  it("probes the OTLP collector through the configured traces endpoint", async () => {
    const requests: Array<{ readonly url: string; readonly method: string }> =
      [];
    const observability = await Effect.runPromise(
      makeObservabilityAdapter({
        otlpHttpEndpoint: "http://localhost:4318",
        grafanaBaseUrl: "http://localhost:3001",
        fetch: async (input, init) => {
          requests.push({
            url: typeof input === "string" ? input : input.toString(),
            method: init?.method ?? "GET",
          });

          return new Response(null, { status: 202 });
        },
      }),
    );

    await expect(Effect.runPromise(observability.healthcheck)).resolves.toEqual(
      {
        healthy: true,
        service: platformAdapterServiceName.observability,
      },
    );
    expect(requests).toEqual([
      {
        url: "http://localhost:4318/v1/traces",
        method: "POST",
      },
    ]);
  });

  it("fails the OTLP collector healthcheck when the collector returns a non-success status", async () => {
    const observability = await Effect.runPromise(
      makeObservabilityAdapter({
        otlpHttpEndpoint: "http://localhost:4318",
        grafanaBaseUrl: "http://localhost:3001",
        fetch: async () => new Response(null, { status: 503 }),
      }),
    );

    await expect(
      Effect.runPromise(Effect.flip(observability.healthcheck)),
    ).resolves.toBeInstanceOf(ObservabilityAdapterRequestError);
  });

  it("probes the GlitchTip DSN store endpoint for readiness", async () => {
    const requests: Array<{ readonly url: string; readonly method: string }> =
      [];
    const glitchtip = await Effect.runPromise(
      makeGlitchtipAdapter({
        dsn: "https://glitchtip.local/api/1/store/",
        fetch: async (input, init) => {
          requests.push({
            url: typeof input === "string" ? input : input.toString(),
            method: init?.method ?? "GET",
          });

          return new Response(null, { status: 405 });
        },
      }),
    );

    await expect(Effect.runPromise(glitchtip.healthcheck)).resolves.toEqual({
      healthy: true,
      service: platformAdapterServiceName.glitchtip,
    });
    expect(requests).toEqual([
      {
        url: "https://glitchtip.local/api/1/store/",
        method: "HEAD",
      },
    ]);
  });

  it("derives the GlitchTip security-report endpoint from a raw project DSN", async () => {
    await expect(
      Effect.runPromise(
        resolveGlitchtipSecurityReportEndpoint(
          "https://public-key@glitchtip.local/1",
        ),
      ),
    ).resolves.toBe(
      "https://glitchtip.local/api/1/security/?sentry_key=public-key",
    );
  });

  it("skips GlitchTip security-report endpoint derivation when only a store endpoint is configured", async () => {
    await expect(
      Effect.runPromise(
        resolveGlitchtipSecurityReportEndpoint(
          "https://glitchtip.local/api/1/store/",
        ),
      ),
    ).resolves.toBeUndefined();
  });

  it("fails the GlitchTip healthcheck when the configured DSN endpoint is not reachable", async () => {
    const glitchtip = await Effect.runPromise(
      makeGlitchtipAdapter({
        dsn: "https://glitchtip.local/api/1/store/",
        fetch: async () => new Response(null, { status: 404 }),
      }),
    );

    await expect(
      Effect.runPromise(Effect.flip(glitchtip.healthcheck)),
    ).resolves.toBeInstanceOf(GlitchtipAdapterRequestError);
  });

  it("treats a placeholder GlitchTip DSN as a typed configuration failure instead of crashing adapter creation", async () => {
    const glitchtip = await Effect.runPromise(
      makeGlitchtipAdapter({
        dsn: "generate-after-running-ops-runtime-bootstrap-or-supplying-managed-glitchtip-dsn",
      }),
    );

    await expect(
      Effect.runPromise(Effect.flip(glitchtip.healthcheck)),
    ).resolves.toBeInstanceOf(GlitchtipAdapterConfigurationError);
  });

  it("fails the OpenPanel healthcheck when the authenticated analytics boundary rejects the client credentials", async () => {
    const openpanel = await Effect.runPromise(
      makeOpenPanelAdapter({
        clientId: "client_demo",
        clientSecret: "client_secret_demo",
        apiUrl: "http://localhost:3005/api",
        fetch: async () =>
          new Response(
            JSON.stringify({
              error: "Unauthorized",
            }),
            {
              status: 401,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
      }),
    );

    await expect(
      Effect.runPromise(Effect.flip(openpanel.healthcheck)),
    ).resolves.toBeInstanceOf(OpenPanelAdapterRequestError);
  });

  it("validates signed Postal delivered webhooks into normalized provider events", async () => {
    const eventTimestamp = 1_717_040_000;
    const request = createSignedPostalWebhookRequest(
      JSON.stringify({
        event: "MessageSent",
        timestamp: eventTimestamp,
        payload: {
          message: {
            message_id: "email-delivery:org:org_1:message_1",
          },
          timestamp: eventTimestamp,
        },
        uuid: "postal-wh-1",
      }),
    );

    await expect(
      Effect.runPromise(
        validateAndNormalizePostalWebhookRequest({
          request,
          apiUrl: "http://postal.example",
          fetchImplementation: async () => createPostalWebhookJwksResponse(),
        }),
      ),
    ).resolves.toEqual({
      messageId: "email-delivery:org:org_1:message_1",
      eventType: emailDeliveryProviderEventType.delivered,
      occurredAt: new Date(eventTimestamp * 1_000).toISOString(),
    });
  });

  it("validates signed Postal webhooks against a configured self-hosted signing key", async () => {
    const eventTimestamp = 1_717_040_050;
    const request = createSignedPostalWebhookRequest(
      JSON.stringify({
        event: "MessageSent",
        timestamp: eventTimestamp,
        payload: {
          message: {
            message_id: "email-delivery:org:org_1:message_self_hosted",
          },
          timestamp: eventTimestamp,
        },
        uuid: "postal-wh-self-hosted-1",
      }),
    );

    await expect(
      Effect.runPromise(
        validateAndNormalizePostalWebhookRequest({
          request,
          apiUrl: "http://postal.example",
          signingKeyBase64: postalWebhookTestSigningKeyBase64,
          fetchImplementation: async () => {
            throw new Error(
              "Expected configured signing-key verification to bypass Postal JWKS fetches.",
            );
          },
        }),
      ),
    ).resolves.toEqual({
      messageId: "email-delivery:org:org_1:message_self_hosted",
      eventType: emailDeliveryProviderEventType.delivered,
      occurredAt: new Date(eventTimestamp * 1_000).toISOString(),
    });
  });

  it("maps Postal delay notifications onto soft-bounce delivery events", async () => {
    const eventTimestamp = 1_717_040_100;
    const request = createSignedPostalWebhookRequest(
      JSON.stringify({
        event: "MessageDelayed",
        timestamp: eventTimestamp,
        payload: {
          message: {
            message_id: "email-delivery:org:org_1:message_2",
          },
          timestamp: eventTimestamp,
        },
        uuid: "postal-wh-2",
      }),
    );

    await expect(
      Effect.runPromise(
        validateAndNormalizePostalWebhookRequest({
          request,
          apiUrl: "http://postal.example",
          fetchImplementation: async () => createPostalWebhookJwksResponse(),
        }),
      ),
    ).resolves.toEqual({
      messageId: "email-delivery:org:org_1:message_2",
      eventType: emailDeliveryProviderEventType.bounced,
      bounceType: emailDeliveryBounceType.soft,
      occurredAt: new Date(eventTimestamp * 1_000).toISOString(),
    });
  });

  it("ignores signed Postal events that do not map onto the shared contract", async () => {
    const request = createSignedPostalWebhookRequest(
      JSON.stringify({
        event: "MessageHeld",
        timestamp: 1_717_040_200,
        payload: {
          message: {
            message_id: "email-delivery:org:org_1:message_3",
          },
        },
        uuid: "postal-wh-3",
      }),
    );

    await expect(
      Effect.runPromise(
        validateAndNormalizePostalWebhookRequest({
          request,
          apiUrl: "http://postal.example",
          fetchImplementation: async () => createPostalWebhookJwksResponse(),
        }),
      ),
    ).resolves.toBeNull();
  });

  it("rejects Postal webhooks with invalid signatures", async () => {
    const request = new Request(
      "http://localhost/api/communication/email-delivery/provider-events/postal",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Postal-Signature-256": "invalid-signature",
          "X-Postal-Signature-KID": postalWebhookTestKeyId,
        },
        body: JSON.stringify({
          event: "MessageSent",
          timestamp: 1_717_040_300,
          payload: {
            message: {
              message_id: "email-delivery:org:org_1:message_4",
            },
          },
          uuid: "postal-wh-4",
        }),
      },
    );

    const result = await Effect.runPromise(
      Effect.either(
        validateAndNormalizePostalWebhookRequest({
          request,
          apiUrl: "http://postal.example",
          fetchImplementation: async () => createPostalWebhookJwksResponse(),
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "PostalWebhookSignatureError",
      },
    });
  });

  it("prioritizes Postal signature validation before payload parsing", async () => {
    const request = new Request(
      "http://localhost/api/communication/email-delivery/provider-events/postal",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Postal-Signature-256": "invalid-signature",
          "X-Postal-Signature-KID": postalWebhookTestKeyId,
        },
        body: "{",
      },
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          validateAndNormalizePostalWebhookRequest({
            request,
            apiUrl: "http://postal.example",
            fetchImplementation: async () => createPostalWebhookJwksResponse(),
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "PostalWebhookSignatureError",
      reason: "signatureVerificationFailed",
    });
  });

  it("surfaces Postal payload mapping failures after a signed webhook verifies", async () => {
    const request = createSignedPostalWebhookRequest("{");

    await expect(
      Effect.runPromise(
        Effect.flip(
          validateAndNormalizePostalWebhookRequest({
            request,
            apiUrl: "http://postal.example",
            fetchImplementation: async () => createPostalWebhookJwksResponse(),
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "PostalWebhookPayloadMappingError",
      reason: "invalidJson",
    });
  });

  it("evaluates Unleash feature flags from declared definitions", async () => {
    const flagKey = `${platformModuleId.tenantBranding}.customDomain`;
    const unleash = await Effect.runPromise(
      makeUnleashAdapter({
        url: "http://localhost:4242",
        apiKey: "test-api-key",
        client: createUnleashTestClient([
          {
            name: flagKey,
            enabled: true,
            project: platformModuleId.tenantBranding,
            type: "release",
            description: "Enable tenant custom-domain rollout.",
            dependencies: [
              {
                feature: `${platformModuleId.tenantBranding}.enabled`,
                enabled: true,
              },
            ],
          },
        ]),
      }),
    );

    await expect(
      Effect.runPromise(
        unleash.evaluateFeatureFlag({
          flagKey,
          fallbackEnabled: false,
          context: {
            userId: "usr_1",
            sessionId: "sess_1",
            properties: {
              scope: platformScope.organization,
              scopeId: "org_1",
            },
          },
        }),
      ),
    ).resolves.toEqual({
      flagKey,
      enabled: true,
      definitionExists: true,
      resolvedScope: platformScope.platform,
      resolvedScopeId: platformScope.platform,
    });

    await expect(
      Effect.runPromise(
        unleash.getFeatureFlagDefinition({
          flagKey,
        }),
      ),
    ).resolves.toEqual({
      flagKey,
      enabled: true,
      project: platformModuleId.tenantBranding,
      type: "release",
      description: "Enable tenant custom-domain rollout.",
      dependencies: [
        {
          feature: `${platformModuleId.tenantBranding}.enabled`,
          enabled: true,
        },
      ],
    });

    const strategyScopedFlagKey = `${platformModuleId.tenantBranding}.scopedRollout`;
    const scopedUnleash = await Effect.runPromise(
      makeUnleashAdapter({
        url: "http://localhost:4242",
        apiKey: "test-api-key",
        client: {
          getFeatureToggleDefinition: (flagKey: string) =>
            flagKey === strategyScopedFlagKey
              ? {
                  name: strategyScopedFlagKey,
                  enabled: true,
                  strategies: [
                    {
                      name: "default",
                      parameters: {},
                      constraints: [
                        {
                          contextName: "organizationId",
                          operator: "IN",
                          inverted: false,
                          values: ["org_1"],
                        },
                      ],
                    },
                  ],
                  dependencies: [],
                }
              : undefined,
          getFeatureToggleDefinitions: () => [
            {
              name: strategyScopedFlagKey,
              enabled: true,
              strategies: [
                {
                  name: "default",
                  parameters: {},
                  constraints: [
                    {
                      contextName: "organizationId",
                      operator: "IN",
                      inverted: false,
                      values: ["org_1"],
                    },
                  ],
                },
              ],
              dependencies: [],
            },
          ],
          isEnabled: (
            flagKey: string,
            _context?: unknown,
            fallbackEnabled?: boolean,
          ) =>
            flagKey === strategyScopedFlagKey
              ? true
              : (fallbackEnabled ?? false),
          client: {
            getStrategy: () => ({
              checkConstraints: (context, constraints) =>
                Array.from(constraints).every(
                  (constraint) =>
                    constraint?.contextName !== "organizationId" ||
                    context.properties?.organizationId === "org_1",
                ),
              getResult: () => ({ enabled: true }),
            }),
            yieldConstraintsFor: function* (strategy) {
              yield* strategy.constraints ?? [];
            },
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        scopedUnleash.evaluateFeatureFlag({
          flagKey: strategyScopedFlagKey,
          fallbackEnabled: false,
          context: {
            userId: "usr_1",
            sessionId: "sess_1",
            properties: {
              tenantScope: platformScope.individual,
              tenantScopeId: "usr_1",
              individualId: "usr_1",
              organizationId: "org_1",
            },
          },
        }),
      ),
    ).resolves.toEqual({
      flagKey: strategyScopedFlagKey,
      enabled: true,
      definitionExists: true,
      resolvedScope: platformScope.organization,
      resolvedScopeId: "org_1",
    });

    const scopedWithoutExpandedDefinitionsFlagKey = `${platformModuleId.tenantBranding}.scopedRolloutWithoutExpandedDefinitions`;
    const scopedWithoutExpandedDefinitionsUnleash = await Effect.runPromise(
      makeUnleashAdapter({
        url: "http://localhost:4242",
        apiKey: "test-api-key",
        client: {
          getFeatureToggleDefinition: (flagKey: string) =>
            flagKey === scopedWithoutExpandedDefinitionsFlagKey
              ? {
                  name: scopedWithoutExpandedDefinitionsFlagKey,
                  enabled: true,
                  strategies: [
                    {
                      name: "default",
                      parameters: {},
                      constraints: [
                        {
                          contextName: "organizationId",
                          operator: "IN",
                          inverted: false,
                          values: ["org_1"],
                        },
                      ],
                    },
                  ],
                  dependencies: [],
                }
              : undefined,
          isEnabled: (
            flagKey: string,
            _context?: unknown,
            fallbackEnabled?: boolean,
          ) =>
            flagKey === scopedWithoutExpandedDefinitionsFlagKey
              ? true
              : (fallbackEnabled ?? false),
          client: {
            getStrategy: () => ({
              checkConstraints: (context, constraints) =>
                Array.from(constraints).every(
                  (constraint) =>
                    constraint?.contextName !== "organizationId" ||
                    context.properties?.organizationId === "org_1",
                ),
              getResult: () => ({ enabled: true }),
            }),
            yieldConstraintsFor: function* (strategy) {
              yield* strategy.constraints ?? [];
            },
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        scopedWithoutExpandedDefinitionsUnleash.evaluateFeatureFlag({
          flagKey: scopedWithoutExpandedDefinitionsFlagKey,
          fallbackEnabled: false,
          context: {
            userId: "usr_1",
            sessionId: "sess_1",
            properties: {
              tenantScope: platformScope.individual,
              tenantScopeId: "usr_1",
              individualId: "usr_1",
              organizationId: "org_1",
            },
          },
        }),
      ),
    ).resolves.toEqual({
      flagKey: scopedWithoutExpandedDefinitionsFlagKey,
      enabled: true,
      definitionExists: true,
      resolvedScope: platformScope.organization,
      resolvedScopeId: "org_1",
    });

    const ambiguousScopeFlagKey = `${platformModuleId.tenantBranding}.ambiguousScope`;
    const ambiguousScopeUnleash = await Effect.runPromise(
      makeUnleashAdapter({
        url: "http://localhost:4242",
        apiKey: "test-api-key",
        client: {
          getFeatureToggleDefinition: (flagKey: string) =>
            flagKey === ambiguousScopeFlagKey
              ? {
                  name: ambiguousScopeFlagKey,
                  enabled: true,
                  strategies: [
                    {
                      name: "default",
                      parameters: {},
                      constraints: [
                        {
                          contextName: "tenantScopeId",
                          operator: "IN",
                          inverted: false,
                          values: ["usr_1"],
                        },
                      ],
                    },
                  ],
                  dependencies: [],
                }
              : undefined,
          getFeatureToggleDefinitions: () => [
            {
              name: ambiguousScopeFlagKey,
              enabled: true,
              strategies: [
                {
                  name: "default",
                  parameters: {},
                  constraints: [
                    {
                      contextName: "tenantScopeId",
                      operator: "IN",
                      inverted: false,
                      values: ["usr_1"],
                    },
                  ],
                },
              ],
              dependencies: [],
            },
          ],
          isEnabled: (
            flagKey: string,
            _context?: unknown,
            fallbackEnabled?: boolean,
          ) =>
            flagKey === ambiguousScopeFlagKey
              ? true
              : (fallbackEnabled ?? false),
          client: {
            getStrategy: () => ({
              checkConstraints: (context, constraints) =>
                Array.from(constraints).every(
                  (constraint) =>
                    constraint?.contextName !== "tenantScopeId" ||
                    context.properties?.tenantScopeId === "usr_1",
                ),
              getResult: () => ({ enabled: true }),
            }),
            yieldConstraintsFor: function* (strategy) {
              yield* strategy.constraints ?? [];
            },
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        ambiguousScopeUnleash.evaluateFeatureFlag({
          flagKey: ambiguousScopeFlagKey,
          fallbackEnabled: false,
          context: {
            properties: {
              tenantScope: platformScope.individual,
              tenantScopeId: "usr_1",
            },
          },
        }),
      ),
    ).resolves.toEqual({
      flagKey: ambiguousScopeFlagKey,
      enabled: true,
      definitionExists: true,
    });

    const userTargetedFlagKey = `${platformModuleId.tenantBranding}.userTargeted`;
    const userTargetedUnleash = await Effect.runPromise(
      makeUnleashAdapter({
        url: "http://localhost:4242",
        apiKey: "test-api-key",
        client: {
          getFeatureToggleDefinition: (flagKey: string) =>
            flagKey === userTargetedFlagKey
              ? {
                  name: userTargetedFlagKey,
                  enabled: true,
                  strategies: [
                    {
                      name: "default",
                      parameters: {},
                      constraints: [
                        {
                          contextName: "userId",
                          operator: "IN",
                          inverted: false,
                          values: ["usr_1"],
                        },
                      ],
                    },
                  ],
                  dependencies: [],
                }
              : undefined,
          getFeatureToggleDefinitions: () => [
            {
              name: userTargetedFlagKey,
              enabled: true,
              strategies: [
                {
                  name: "default",
                  parameters: {},
                  constraints: [
                    {
                      contextName: "userId",
                      operator: "IN",
                      inverted: false,
                      values: ["usr_1"],
                    },
                  ],
                },
              ],
              dependencies: [],
            },
          ],
          isEnabled: (
            flagKey: string,
            _context?: unknown,
            fallbackEnabled?: boolean,
          ) =>
            flagKey === userTargetedFlagKey ? true : (fallbackEnabled ?? false),
          client: {
            getStrategy: () => ({
              checkConstraints: (context, constraints) =>
                Array.from(constraints).every(
                  (constraint) =>
                    constraint?.contextName !== "userId" ||
                    context.userId === "usr_1",
                ),
              getResult: () => ({ enabled: true }),
            }),
            yieldConstraintsFor: function* (strategy) {
              yield* strategy.constraints ?? [];
            },
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        userTargetedUnleash.evaluateFeatureFlag({
          flagKey: userTargetedFlagKey,
          fallbackEnabled: false,
          context: {
            userId: "usr_1",
            properties: {
              tenantScope: platformScope.individual,
              tenantScopeId: "usr_1",
            },
          },
        }),
      ),
    ).resolves.toEqual({
      flagKey: userTargetedFlagKey,
      enabled: true,
      definitionExists: true,
    });
  });

  it("normalizes Polar SDK base URLs that already include /v1", async () => {
    let requestedUrl: string | undefined;

    const polar = await Effect.runPromise(
      makePolarAdapter({
        apiKey: "polar-key",
        apiUrl: "http://localhost:8888/v1",
        fetch: async (input) => {
          requestedUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;

          return new Response(
            JSON.stringify({
              items: [],
              pagination: {
                total_count: 0,
                max_page: 0,
              },
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        },
      }),
    );

    await expect(Effect.runPromise(polar.listPlans)).resolves.toEqual([]);
    expect(requestedUrl).toContain("/v1/products");
    expect(requestedUrl).not.toContain("/v1/v1/products");
  });

  it("manages tenant search indexes through the Meilisearch fetch seam", async () => {
    const indexName = `${platformModuleId.search}:${platformScope.organization}:org_1`;
    const indexUid = "search__organization__org_1";
    let settingsTaskReads = 0;
    const requests: Array<{
      url: string;
      method: string;
      authorization: string | null;
      body?: unknown;
    }> = [];
    let indexedDocumentCount = 17;
    const meilisearchFetch: typeof fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const headers = new Headers(init?.headers);
      const method = init?.method ?? "GET";
      const bodyText = typeof init?.body === "string" ? init.body : undefined;

      requests.push({
        url,
        method,
        authorization: headers.get("Authorization"),
        ...(bodyText !== undefined ? { body: JSON.parse(bodyText) } : {}),
      });

      if (url.endsWith("/indexes") && method === "POST") {
        return new Response(JSON.stringify({ taskUid: 1 }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.endsWith("/tasks/1") && method === "GET") {
        return new Response(JSON.stringify({ uid: 1, status: "succeeded" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (
        url.endsWith(`/indexes/${encodeURIComponent(indexUid)}/settings`) &&
        method === "PATCH"
      ) {
        return new Response(JSON.stringify({ taskUid: 2 }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.endsWith("/tasks/2") && method === "GET") {
        settingsTaskReads += 1;

        if (settingsTaskReads === 1) {
          return new Response(
            JSON.stringify({
              uid: 2,
              status: "processing",
              finishedAt: null,
              error: null,
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            uid: 2,
            status: "succeeded",
            finishedAt: "2026-04-27T19:00:00.000Z",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (
        url.endsWith(`/indexes/${encodeURIComponent(indexUid)}/stats`) &&
        method === "GET"
      ) {
        return new Response(
          JSON.stringify({ numberOfDocuments: indexedDocumentCount }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (
        url.endsWith(`/indexes/${encodeURIComponent(indexUid)}/documents`) &&
        method === "DELETE"
      ) {
        indexedDocumentCount = 0;
        return new Response(JSON.stringify({ taskUid: 3 }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.endsWith("/tasks/3") && method === "GET") {
        return new Response(
          JSON.stringify({
            uid: 3,
            status: "succeeded",
            finishedAt: "2026-04-27T19:02:00.000Z",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (
        url.endsWith(`/indexes/${encodeURIComponent(indexUid)}/documents`) &&
        method === "POST"
      ) {
        indexedDocumentCount = Array.isArray(requests.at(-1)?.body)
          ? (requests.at(-1)?.body as ReadonlyArray<unknown>).length
          : 0;
        return new Response(JSON.stringify({ taskUid: 4 }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.endsWith("/tasks/4") && method === "GET") {
        return new Response(
          JSON.stringify({
            uid: 4,
            status: "succeeded",
            finishedAt: "2026-04-27T19:03:00.000Z",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (
        url.endsWith(`/indexes/${encodeURIComponent(indexUid)}/search`) &&
        method === "POST"
      ) {
        const requestBody = requests.at(-1)?.body as
          | { readonly filter?: string }
          | undefined;

        if (
          requestBody?.filter?.includes(searchDocumentFamily.supportCaseSummary)
        ) {
          return new Response(
            JSON.stringify({
              hits: [
                {
                  caseId: "case_1",
                  supportAgent: "usr_support_1",
                  tenantScope: platformScope.organization,
                  tenantScopeId: "org_1",
                  summary: "Invoice search mismatch",
                  status: supportOperationsCaseStatus.open,
                  priority: supportOperationsCasePriority.high,
                  startedAt: "2026-04-27T18:00:00.000Z",
                  lastUpdatedAt: "2026-04-27T18:30:00.000Z",
                },
              ],
              estimatedTotalHits: 1,
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            hits: [
              {
                fileId: "file_1",
                fileName: "invoice.pdf",
                contentType: "application/pdf",
                sizeBytes: 1024,
              },
            ],
            estimatedTotalHits: 1,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (
        url.endsWith(`/indexes/${encodeURIComponent(indexUid)}`) &&
        method === "DELETE"
      ) {
        return new Response(JSON.stringify({ taskUid: 5 }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.endsWith("/tasks/5") && method === "GET") {
        return new Response(
          JSON.stringify({
            uid: 5,
            status: "succeeded",
            finishedAt: "2026-04-27T19:05:00.000Z",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      return new Response("not found", { status: 404 });
    };

    const meilisearch = await Effect.runPromise(
      makeMeilisearchAdapter(
        {
          url: "http://localhost:7700",
          apiKey: "meili-master-key",
        },
        { fetch: meilisearchFetch },
      ),
    );

    await expect(
      Effect.runPromise(
        meilisearch.ensureTenantIndex({
          indexName,
          scope: platformScope.organization,
          scopeId: "org_1",
          settings: {
            filterableAttributes: ["status", "moduleId"],
            sortableAttributes: ["updatedAt"],
            searchableAttributes: ["title", "content"],
            rankingRules: ["words", "typo", "sort"],
            synonyms: {
              invoice: ["bill", "statement"],
            },
          },
        }),
      ),
    ).resolves.toEqual({
      indexName,
      scope: platformScope.organization,
      scopeId: "org_1",
      documentCount: 17,
      lifecycleState: searchIndexLifecycleState.ready,
      lastSyncedAt: "2026-04-27T19:00:00.000Z",
    });

    await expect(
      Effect.runPromise(
        meilisearch.replaceManagedFileDocuments({
          indexName,
          scope: platformScope.organization,
          scopeId: "org_1",
          documents: [
            {
              fileId: "file_1",
              fileName: "invoice.pdf",
              contentType: "application/pdf",
              sizeBytes: 1024,
            },
          ],
        }),
      ),
    ).resolves.toEqual({
      indexName,
      scope: platformScope.organization,
      scopeId: "org_1",
      documentCount: 1,
      lifecycleState: searchIndexLifecycleState.ready,
      lastSyncedAt: "2026-04-27T19:03:00.000Z",
    });

    await expect(
      Effect.runPromise(
        meilisearch.queryManagedFiles({
          indexName,
          scope: platformScope.organization,
          scopeId: "org_1",
          query: "invoice",
          limit: 5,
        }),
      ),
    ).resolves.toEqual({
      query: "invoice",
      hits: [
        {
          fileId: "file_1",
          fileName: "invoice.pdf",
          contentType: "application/pdf",
          sizeBytes: 1024,
        },
      ],
      estimatedTotalHits: 1,
    });

    await expect(
      Effect.runPromise(
        meilisearch.querySupportCases({
          indexName,
          scope: platformScope.organization,
          scopeId: "org_1",
          query: "invoice",
          limit: 5,
          status: [supportOperationsCaseStatus.open],
          priority: [supportOperationsCasePriority.high],
          sort: {
            field: searchSupportCaseSortField.lastUpdatedAt,
            direction: searchSortDirection.desc,
          },
        }),
      ),
    ).resolves.toEqual({
      query: "invoice",
      hits: [
        {
          caseId: "case_1",
          supportAgent: "usr_support_1",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          summary: "Invoice search mismatch",
          status: supportOperationsCaseStatus.open,
          priority: supportOperationsCasePriority.high,
          startedAt: "2026-04-27T18:00:00.000Z",
          lastUpdatedAt: "2026-04-27T18:30:00.000Z",
        },
      ],
      estimatedTotalHits: 1,
    });

    await expect(
      Effect.runPromise(
        meilisearch.getTenantIndex({
          indexName,
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    ).resolves.toEqual({
      indexName,
      scope: platformScope.organization,
      scopeId: "org_1",
      documentCount: 1,
      lifecycleState: searchIndexLifecycleState.ready,
    });

    await expect(
      Effect.runPromise(
        meilisearch.deleteTenantIndex({
          indexName,
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    ).resolves.toMatchObject({
      indexName,
      scope: platformScope.organization,
      scopeId: "org_1",
      deleted: true,
      deletedAt: expect.any(String),
    });

    expect(requests).toEqual([
      {
        url: "http://localhost:7700/indexes",
        method: "POST",
        authorization: "Bearer meili-master-key",
        body: { uid: indexUid, primaryKey: searchFields.documentId },
      },
      {
        url: "http://localhost:7700/tasks/1",
        method: "GET",
        authorization: "Bearer meili-master-key",
      },
      {
        url: `http://localhost:7700/indexes/${encodeURIComponent(indexUid)}/settings`,
        method: "PATCH",
        authorization: "Bearer meili-master-key",
        body: {
          filterableAttributes: ["status", "moduleId"],
          sortableAttributes: ["updatedAt"],
          searchableAttributes: ["title", "content"],
          rankingRules: ["words", "typo", "sort"],
          synonyms: {
            invoice: ["bill", "statement"],
          },
        },
      },
      {
        url: "http://localhost:7700/tasks/2",
        method: "GET",
        authorization: "Bearer meili-master-key",
      },
      {
        url: "http://localhost:7700/tasks/2",
        method: "GET",
        authorization: "Bearer meili-master-key",
      },
      {
        url: `http://localhost:7700/indexes/${encodeURIComponent(indexUid)}/stats`,
        method: "GET",
        authorization: "Bearer meili-master-key",
      },
      {
        url: `http://localhost:7700/indexes/${encodeURIComponent(indexUid)}/documents`,
        method: "DELETE",
        authorization: "Bearer meili-master-key",
      },
      {
        url: "http://localhost:7700/tasks/3",
        method: "GET",
        authorization: "Bearer meili-master-key",
      },
      {
        url: `http://localhost:7700/indexes/${encodeURIComponent(indexUid)}/documents`,
        method: "POST",
        authorization: "Bearer meili-master-key",
        body: [
          {
            documentId: `${searchDocumentFamily.managedFileSummary}__file_1`,
            fileId: "file_1",
            fileName: "invoice.pdf",
            contentType: "application/pdf",
            sizeBytes: 1024,
            documentFamily: searchDocumentFamily.managedFileSummary,
          },
        ],
      },
      {
        url: "http://localhost:7700/tasks/4",
        method: "GET",
        authorization: "Bearer meili-master-key",
      },
      {
        url: `http://localhost:7700/indexes/${encodeURIComponent(indexUid)}/stats`,
        method: "GET",
        authorization: "Bearer meili-master-key",
      },
      {
        url: `http://localhost:7700/indexes/${encodeURIComponent(indexUid)}/search`,
        method: "POST",
        authorization: "Bearer meili-master-key",
        body: {
          q: "invoice",
          filter: `documentFamily = "${searchDocumentFamily.managedFileSummary}"`,
          attributesToRetrieve: [
            "fileId",
            "fileName",
            "contentType",
            "sizeBytes",
            "deletedAt",
          ],
          limit: 5,
        },
      },
      {
        url: `http://localhost:7700/indexes/${encodeURIComponent(indexUid)}/search`,
        method: "POST",
        authorization: "Bearer meili-master-key",
        body: {
          q: "invoice",
          filter: `documentFamily = "${searchDocumentFamily.supportCaseSummary}" AND (status = "${supportOperationsCaseStatus.open}") AND (priority = "${supportOperationsCasePriority.high}")`,
          attributesToRetrieve: [
            "caseId",
            "supportAgent",
            "tenantScope",
            "tenantScopeId",
            "summary",
            "status",
            "priority",
            "startedAt",
            "lastUpdatedAt",
          ],
          limit: 5,
          sort: [
            `${searchSupportCaseSortField.lastUpdatedAt}:${searchSortDirection.desc}`,
          ],
        },
      },
      {
        url: `http://localhost:7700/indexes/${encodeURIComponent(indexUid)}/stats`,
        method: "GET",
        authorization: "Bearer meili-master-key",
      },
      {
        url: `http://localhost:7700/indexes/${encodeURIComponent(indexUid)}`,
        method: "DELETE",
        authorization: "Bearer meili-master-key",
      },
      {
        url: "http://localhost:7700/tasks/5",
        method: "GET",
        authorization: "Bearer meili-master-key",
      },
    ]);
  });

  it("fails the search lifecycle request when a Meilisearch task reports failure", async () => {
    const indexName = `${platformModuleId.search}:${platformScope.organization}:org_1`;
    const meilisearch = await Effect.runPromise(
      makeMeilisearchAdapter(
        {
          url: "http://localhost:7700",
          apiKey: "meili-master-key",
        },
        {
          fetch: async (input, init) => {
            const url =
              typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url;
            const method = init?.method ?? "GET";

            if (url.endsWith("/indexes") && method === "POST") {
              return new Response(JSON.stringify({ taskUid: 11 }), {
                status: 202,
                headers: { "content-type": "application/json" },
              });
            }

            if (url.endsWith("/tasks/11") && method === "GET") {
              return new Response(
                JSON.stringify({
                  uid: 11,
                  status: "failed",
                  error: {
                    message: "index creation rejected by Meilisearch",
                  },
                }),
                {
                  status: 200,
                  headers: { "content-type": "application/json" },
                },
              );
            }

            return new Response("not found", { status: 404 });
          },
        },
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        meilisearch.ensureTenantIndex({
          indexName,
          scope: platformScope.organization,
          scopeId: "org_1",
          settings: {
            filterableAttributes: ["status"],
            sortableAttributes: ["updatedAt"],
            searchableAttributes: ["title"],
            rankingRules: ["words"],
          },
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "MeilisearchAdapterRequestError",
        operation: "ensureTenantIndex",
      },
    });
  });

  it("clears tenant-index synonyms when durable settings omit them", async () => {
    const indexName = `${platformModuleId.search}:${platformScope.organization}:org_1`;
    const indexUid = "search__organization__org_1";
    const requests: Array<{
      readonly url: string;
      readonly method: string;
      readonly authorization?: string;
      readonly body?: unknown;
    }> = [];

    const meilisearch = await Effect.runPromise(
      makeMeilisearchAdapter(
        {
          url: "http://localhost:7700",
          apiKey: "meili-master-key",
        },
        {
          fetch: async (input, init) => {
            const url =
              typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url;
            const method = init?.method ?? "GET";
            const body =
              typeof init?.body === "string"
                ? JSON.parse(init.body)
                : undefined;
            const authorization =
              init?.headers instanceof Headers
                ? (init.headers.get("Authorization") ?? undefined)
                : Array.isArray(init?.headers)
                  ? undefined
                  : (init?.headers as Record<string, string> | undefined)
                      ?.Authorization;

            requests.push({
              url,
              method,
              ...(authorization === undefined ? {} : { authorization }),
              ...(body !== undefined ? { body } : {}),
            });

            if (url.endsWith("/indexes") && method === "POST") {
              return new Response(JSON.stringify({ taskUid: 11 }), {
                status: 202,
                headers: { "content-type": "application/json" },
              });
            }

            if (url.endsWith("/tasks/11") && method === "GET") {
              return new Response(
                JSON.stringify({
                  uid: 11,
                  status: "succeeded",
                  finishedAt: "2026-05-08T09:00:00.000Z",
                }),
                {
                  status: 200,
                  headers: { "content-type": "application/json" },
                },
              );
            }

            if (
              url.endsWith(
                `/indexes/${encodeURIComponent(indexUid)}/settings`,
              ) &&
              method === "PATCH"
            ) {
              return new Response(JSON.stringify({ taskUid: 12 }), {
                status: 202,
                headers: { "content-type": "application/json" },
              });
            }

            if (url.endsWith("/tasks/12") && method === "GET") {
              return new Response(
                JSON.stringify({
                  uid: 12,
                  status: "succeeded",
                  finishedAt: "2026-05-08T09:01:00.000Z",
                }),
                {
                  status: 200,
                  headers: { "content-type": "application/json" },
                },
              );
            }

            if (
              url.endsWith(`/indexes/${encodeURIComponent(indexUid)}/stats`) &&
              method === "GET"
            ) {
              return new Response(JSON.stringify({ numberOfDocuments: 0 }), {
                status: 200,
                headers: { "content-type": "application/json" },
              });
            }

            return new Response("not found", { status: 404 });
          },
        },
      ),
    );

    await expect(
      Effect.runPromise(
        meilisearch.ensureTenantIndex({
          indexName,
          scope: platformScope.organization,
          scopeId: "org_1",
          settings: {
            filterableAttributes: ["status"],
            sortableAttributes: ["updatedAt"],
            searchableAttributes: ["title"],
            rankingRules: ["words"],
          },
        }),
      ),
    ).resolves.toEqual({
      indexName,
      scope: platformScope.organization,
      scopeId: "org_1",
      documentCount: 0,
      lifecycleState: searchIndexLifecycleState.ready,
      lastSyncedAt: "2026-05-08T09:01:00.000Z",
    });

    expect(requests).toContainEqual({
      url: `http://localhost:7700/indexes/${encodeURIComponent(indexUid)}/settings`,
      method: "PATCH",
      authorization: "Bearer meili-master-key",
      body: {
        filterableAttributes: ["status"],
        sortableAttributes: ["updatedAt"],
        searchableAttributes: ["title"],
        rankingRules: ["words"],
        synonyms: {},
      },
    });
  });

  it("creates a postgres adapter with an explicit runtime connection seam", async () => {
    const postgres = await Effect.runPromise(
      makePostgresAdapter({
        connectionString:
          "postgresql://postgres:postgres@127.0.0.1:1/comvestec",
        connectionTimeoutMs: 50,
      }),
    );

    expect(postgres.serviceName).toBe(platformAdapterServiceName.postgres);
    expect(postgres.connectionStringName).toBe("POSTGRES_URL");
    await expect(
      Effect.runPromiseExit(postgres.healthcheck),
    ).resolves.toMatchObject({
      _tag: "Failure",
    });
    await expect(Effect.runPromise(postgres.close)).resolves.toBeUndefined();
  });

  it("requires POSTGRES_URL when creating a postgres adapter from environment", async () => {
    await expect(
      Effect.runPromiseExit(makePostgresAdapterFromEnvironment({})),
    ).resolves.toMatchObject({
      _tag: "Failure",
    });
  });

  it("creates checkout sessions for configured backend plan catalogs", async () => {
    const polar = await Effect.runPromise(
      makePolarAdapter(
        createPolarTestOptions({
          plans: [
            {
              planId: "plan_growth",
              planKey: "growth",
              displayName: "Growth",
              active: true,
              prices: [
                {
                  priceId: "price_growth_month",
                  interval: billingPlanInterval.month,
                  currency: "USD",
                  amountMinor: 2900,
                  active: true,
                  providerPriceId: "polar_price_growth_month",
                },
                {
                  priceId: "price_growth_year",
                  interval: billingPlanInterval.year,
                  currency: "USD",
                  amountMinor: 29000,
                  active: true,
                  providerPriceId: "polar_price_growth_year",
                },
              ],
              entitlements: [
                {
                  moduleId: platformModuleId.tenantManagement,
                  included: true,
                  meteringMode: billingMeteringMode.none,
                  enforcementMode: billingEnforcementMode.none,
                },
              ],
            },
          ],
        }),
      ),
    );

    await expect(Effect.runPromise(polar.listPlans)).resolves.toEqual([
      expect.objectContaining({
        planId: "plan_growth",
        prices: expect.arrayContaining([
          expect.objectContaining({ priceId: "price_growth_month" }),
          expect.objectContaining({ priceId: "price_growth_year" }),
        ]),
      }),
    ]);
    await expect(
      Effect.runPromise(
        polar.createCheckoutSession({
          planId: "plan_growth",
          priceId: "price_growth_month",
          successUrl: "http://localhost:3002/billing/success",
          cancelUrl: "http://localhost:3002/billing/cancel",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_growth",
        }),
      ),
    ).resolves.toMatchObject({
      checkoutSessionId: "checkout:plan_growth:price_growth_month",
      priceId: "price_growth_month",
      interval: billingPlanInterval.month,
    });
  });

  it("sends lowercase currency codes to the polar sdk for managed plans", async () => {
    const polarOptions = createPolarTestOptions();
    let capturedRequest:
      | Parameters<
          NonNullable<typeof polarOptions.sdkClient>["products"]["create"]
        >[0]
      | undefined;

    const polar = await Effect.runPromise(
      makePolarAdapter({
        ...polarOptions,
        sdkClient: {
          ...polarOptions.sdkClient!,
          products: {
            ...polarOptions.sdkClient!.products,
            create: async (request) => {
              capturedRequest = request;

              return {
                id: "plan_seed_scale",
                name: request.name,
                description: request.description ?? null,
                recurringInterval: request.recurringInterval,
                recurringIntervalCount: request.recurringIntervalCount ?? 1,
                visibility: request.visibility ?? "draft",
                isArchived: false,
                metadata: request.metadata ?? {},
                prices: request.prices.map((price, index) => ({
                  id: `price_seed_scale_${index + 1}`,
                  recurringInterval: request.recurringInterval,
                  priceCurrency: price.priceCurrency ?? "usd",
                  priceAmount: price.priceAmount,
                  isArchived: false,
                })),
              };
            },
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        polar.createManagedBillingPlan({
          planKey: "scale",
          displayName: "Scale",
          description: "Operator-created recurring plan.",
          visibility: billingPlanVisibility.draft,
          price: {
            interval: billingPlanInterval.month,
            currency: "USD",
            amountMinor: 4900,
          },
          entitlements: [
            {
              moduleId: platformModuleId.tenantManagement,
              included: true,
              meteringMode: billingMeteringMode.none,
              enforcementMode: billingEnforcementMode.none,
            },
          ],
        }),
      ),
    ).resolves.toMatchObject({
      plan: expect.objectContaining({
        planKey: "scale",
      }),
    });

    expect(capturedRequest?.prices[0]?.priceCurrency).toBe("usd");
  });

  it("returns the existing public managed plan instead of creating a duplicate", async () => {
    const existingScalePlan = defaultTestBillingPlans.find(
      (plan) => plan.planKey === "scale",
    );

    expect(existingScalePlan).toBeDefined();

    if (existingScalePlan === undefined) {
      return;
    }

    const polarOptions = createPolarTestOptions();
    let createCallCount = 0;

    const polar = await Effect.runPromise(
      makePolarAdapter({
        ...polarOptions,
        sdkClient: {
          ...polarOptions.sdkClient!,
          products: {
            ...polarOptions.sdkClient!.products,
            create: async (request) => {
              createCallCount += 1;

              return polarOptions.sdkClient!.products.create(request);
            },
          },
        },
      }),
    );

    await expect(
      Effect.runPromise(
        polar.createManagedBillingPlan({
          planKey: existingScalePlan.planKey,
          displayName: existingScalePlan.displayName,
          description: existingScalePlan.description,
          visibility: billingPlanVisibility.public,
          price: {
            interval: existingScalePlan.prices[0]!.interval,
            currency: existingScalePlan.prices[0]!.currency,
            amountMinor: existingScalePlan.prices[0]!.amountMinor,
          },
          entitlements: existingScalePlan.entitlements,
        }),
      ),
    ).resolves.toMatchObject({
      plan: expect.objectContaining({
        planId: existingScalePlan.planId,
        planKey: existingScalePlan.planKey,
      }),
      visibility: billingPlanVisibility.public,
      provider: platformAdapterServiceName.polar,
    });

    expect(createCallCount).toBe(0);
  });

  it("updates duplicate managed products into a different canonical plan", async () => {
    const starterPlan = defaultTestBillingPlans.find(
      (plan) => plan.planKey === "starter",
    );
    const growthPlan = defaultTestBillingPlans.find(
      (plan) => plan.planKey === "growth",
    );

    expect(starterPlan).toBeDefined();
    expect(growthPlan).toBeDefined();

    if (starterPlan === undefined || growthPlan === undefined) {
      return;
    }

    const polar = await Effect.runPromise(
      makePolarAdapter(createPolarTestOptions()),
    );

    await expect(
      Effect.runPromise(
        polar.updateManagedBillingPlan(starterPlan.planId, {
          planKey: growthPlan.planKey,
          displayName: growthPlan.displayName,
          description: growthPlan.description,
          visibility: billingPlanVisibility.public,
          price: {
            interval: growthPlan.prices[0]!.interval,
            currency: growthPlan.prices[0]!.currency,
            amountMinor: growthPlan.prices[0]!.amountMinor,
          },
          entitlements: growthPlan.entitlements,
        }),
      ),
    ).resolves.toMatchObject({
      plan: expect.objectContaining({
        planId: starterPlan.planId,
        planKey: growthPlan.planKey,
        displayName: growthPlan.displayName,
        prices: [
          expect.objectContaining({
            interval: growthPlan.prices[0]!.interval,
            amountMinor: growthPlan.prices[0]!.amountMinor,
          }),
        ],
      }),
      visibility: billingPlanVisibility.public,
      provider: platformAdapterServiceName.polar,
    });
  });

  it("archives managed products that should be removed from the public catalog", async () => {
    const scalePlan = defaultTestBillingPlans.find(
      (plan) => plan.planKey === "scale",
    );

    expect(scalePlan).toBeDefined();

    if (scalePlan === undefined) {
      return;
    }

    const polar = await Effect.runPromise(
      makePolarAdapter(createPolarTestOptions()),
    );

    await expect(
      Effect.runPromise(polar.archiveManagedBillingPlan(scalePlan.planId)),
    ).resolves.toMatchObject({
      plan: expect.objectContaining({
        planId: scalePlan.planId,
        active: false,
      }),
      provider: platformAdapterServiceName.polar,
    });

    await expect(Effect.runPromise(polar.listPlans)).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ planId: scalePlan.planId }),
      ]),
    );
  });

  it("normalizes verified polar webhook deliveries into billing reconciliation", async () => {
    const polar = await Effect.runPromise(
      makePolarAdapter(createPolarTestOptions()),
    );

    await expect(
      Effect.runPromise(
        polar.reconcileWebhookEvent({
          provider: platformAdapterServiceName.polar,
          deliveryId: "wh_1",
          eventId: "evt_1",
          eventType: billingWebhookEventType.checkoutCompleted,
          occurredAt: new Date().toISOString(),
          verifiedSignature: true,
          subscriptionId: "sub_1",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          planId: "plan_starter",
          priceId: "price_starter_month",
          customerId: "cus_1",
          currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      ),
    ).resolves.toMatchObject({
      action: billingWebhookReconciliationAction.activate,
      event: {
        eventType: billingWebhookEventType.checkoutCompleted,
        planId: "plan_starter",
      },
      subscription: {
        status: billingSubscriptionStatus.active,
        interval: billingPlanInterval.month,
      },
      entitlementsActive: true,
    });
  });

  it("rejects unverified polar webhook deliveries", async () => {
    const polar = await Effect.runPromise(
      makePolarAdapter(createPolarTestOptions()),
    );

    await expect(
      Effect.runPromise(
        Effect.either(
          polar.reconcileWebhookEvent({
            provider: platformAdapterServiceName.polar,
            deliveryId: "wh_unverified",
            eventId: "evt_unverified",
            eventType: billingWebhookEventType.checkoutCompleted,
            occurredAt: new Date().toISOString(),
            verifiedSignature: false,
            subscriptionId: "sub_1",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            planId: "plan_starter",
            priceId: "price_starter_month",
            customerId: "cus_1",
            currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "Left",
      left: {
        _tag: "PolarWebhookSignatureError",
        deliveryId: "wh_unverified",
      },
    });
  });

  it("supports counter and session operations through the valkey client seam", async () => {
    const valkey = await Effect.runPromise(
      makeValkeyAdapter({
        url: "redis://localhost:6379",
        client: createValkeyTestClient(),
      }),
    );

    await Effect.runPromise(
      valkey.incrementCounter({ key: "quota:org_1", incrementBy: 1 }),
    );
    await Effect.runPromise(
      valkey.incrementCounter({ key: "quota:org_2", incrementBy: 1 }),
    );

    await expect(
      Effect.runPromise(
        valkey.incrementCounter({ key: "quota:org_1", incrementBy: 1 }),
      ),
    ).resolves.toMatchObject({ key: "quota:org_1", value: 2 });
    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_old",
        requestContext: {
          actorType: actorType.organizationMember,
          actorId: "usr_old",
          sessionId: "sess_old",
          correlationId: "corr_old",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_old",
            enterpriseId: "ent_old",
            organizationId: "org_old",
            individualId: "usr_old",
          },
        },
      }),
    );
    await Effect.runPromise(
      valkey.writeSession({
        sessionId: "sess_new",
        requestContext: {
          actorType: actorType.organizationMember,
          actorId: "usr_new",
          sessionId: "sess_new",
          correlationId: "corr_new",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_new",
            enterpriseId: "ent_new",
            organizationId: "org_new",
            individualId: "usr_new",
          },
        },
      }),
    );
    await expect(
      Effect.runPromise(valkey.readSession({ sessionId: "sess_old" })),
    ).resolves.toMatchObject({ sessionId: "sess_old" });
    await expect(
      Effect.runPromise(valkey.readSession({ sessionId: "sess_new" })),
    ).resolves.toMatchObject({ sessionId: "sess_new" });
    await expect(
      Effect.runPromise(valkey.deleteSession({ sessionId: "sess_old" })),
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(valkey.readSession({ sessionId: "sess_old" })),
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(valkey.readSession({ sessionId: "sess_new" })),
    ).resolves.toMatchObject({ sessionId: "sess_new" });
    await expect(Effect.runPromise(valkey.close)).resolves.toBeUndefined();
  });

  it("checks permissions through the ory keto HTTP seam", async () => {
    const keto = await Effect.runPromise(
      makeOryKetoAdapter(createOryKetoTestOptions()),
    );

    await Effect.runPromise(
      keto.writeTuple({
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        subject: "usr_1",
      }),
    );
    await Effect.runPromise(
      keto.writeTuple({
        namespace: authorizationNamespace.tenant,
        object: "org_2",
        relation: authorizationRelation.viewer,
        subject: "usr_2",
      }),
    );

    await expect(
      Effect.runPromise(
        keto.check({
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.viewer,
          subject: "usr_1",
        }),
      ),
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      Effect.runPromise(
        keto.check({
          namespace: authorizationNamespace.tenant,
          object: "org_missing",
          relation: authorizationRelation.viewer,
          subject: "usr_missing",
        }),
      ),
    ).resolves.toMatchObject({ allowed: false });
  });

  it("treats denied Ory Keto permission checks as valid false results", async () => {
    const keto = await Effect.runPromise(
      makeOryKetoAdapter(
        createOryKetoTestOptions({
          fetch: async (input) => {
            const url = new URL(
              typeof input === "string" ? input : input.toString(),
            );

            if (url.pathname === "/relation-tuples/check") {
              return Response.json(
                {
                  allowed: false,
                },
                {
                  status: 403,
                },
              );
            }

            return new Response("Not Found", {
              status: 404,
              statusText: "Not Found",
            });
          },
        }),
      ),
    );

    await expect(
      Effect.runPromise(
        keto.check({
          namespace: authorizationNamespace.tenant,
          object: "org_missing",
          relation: authorizationRelation.viewer,
          subject: "usr_missing",
        }),
      ),
    ).resolves.toMatchObject({ allowed: false });
  });

  it("deletes Ory Keto tuples through the HTTP seam", async () => {
    const keto = await Effect.runPromise(
      makeOryKetoAdapter(createOryKetoTestOptions()),
    );

    await Effect.runPromise(
      keto.writeTuple({
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.admin,
        subject: "usr_admin_1",
      }),
    );

    await expect(
      Effect.runPromise(
        keto.listTuples({
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.admin,
          subject: "usr_admin_1",
        }),
      ),
    ).resolves.toEqual([
      {
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.admin,
        subject: "usr_admin_1",
      },
    ]);

    await expect(
      Effect.runPromise(
        keto.deleteTuple({
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.admin,
          subject: "usr_admin_1",
        }),
      ),
    ).resolves.toEqual({
      namespace: authorizationNamespace.tenant,
      object: "org_1",
      relation: authorizationRelation.admin,
      subject: "usr_admin_1",
    });

    await expect(
      Effect.runPromise(
        keto.listTuples({
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.admin,
          subject: "usr_admin_1",
        }),
      ),
    ).resolves.toEqual([]);
  });

  it("rejects empty runtime configuration at adapter boundaries", async () => {
    const keycloakResult = await Effect.runPromise(
      Effect.either(
        makeKeycloakAdapter({
          baseUrl: "",
          realm: "comvestec",
          clientId: "saas-platform",
          clientSecret: "change-me",
        }),
      ),
    );
    const postalResult = await Effect.runPromise(
      Effect.either(
        makePostalAdapter({
          apiUrl: "http://localhost:5000",
          apiKey: "",
        }),
      ),
    );
    const observability = await Effect.runPromise(
      makeObservabilityAdapter({
        otlpHttpEndpoint: "http://localhost:4318",
        grafanaBaseUrl: "http://localhost:3001",
      }),
    );
    const emissionResult = await Effect.runPromise(
      Effect.either(
        observability.emit({
          kind: telemetryKind.trace,
          service: "",
          payload: { correlationId: "corr_3" },
        }),
      ),
    );

    expect(keycloakResult._tag).toBe("Left");
    expect(postalResult._tag).toBe("Left");
    expect(emissionResult._tag).toBe("Left");
  });
});
