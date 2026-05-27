import { Effect, ParseResult, Schema } from "effect";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  identityClaimKey,
  platformModuleId,
  platformScope,
  type ActorType,
} from "@comvestec/contracts";
import {
  makeKeycloakAdapter,
  makeOryKetoAdapter,
  runAdminOrganizationFromEnvironment,
} from "@comvestec/platform";
import {
  buildExactMatchUrl,
  createKeycloakAdminHeaders,
  ensureKeycloakActorTypeClaimConfiguration,
  issueKeycloakPasswordGrant,
  printToolingScriptError,
  requestEmpty,
  requestJson,
} from "../subscriber-journey/common";

const ProvisionAdminOperatorEnvironmentSchema = Schema.Struct({
  ADMIN_APP_BASE_URL: Schema.NonEmptyString,
  KETO_READ_URL: Schema.NonEmptyString,
  KETO_WRITE_URL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  KEYCLOAK_ADMIN: Schema.NonEmptyString,
  KEYCLOAK_ADMIN_PASSWORD: Schema.NonEmptyString,
});

const KeycloakUserMatchSchema = Schema.Array(
  Schema.Struct({
    id: Schema.NonEmptyString,
  }),
);

const KeycloakClientMatchSchema = Schema.Array(
  Schema.Struct({
    id: Schema.NonEmptyString,
  }),
);

const ProvisionAdminOperatorInputSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
  username: Schema.NonEmptyString,
  password: Schema.NonEmptyString,
  actorType: Schema.Literal(actorType.platformOperator),
});

type ProvisionAdminOperatorEnvironment = Schema.Schema.Type<
  typeof ProvisionAdminOperatorEnvironmentSchema
>;

type ProvisionAdminOperatorInput = Schema.Schema.Type<
  typeof ProvisionAdminOperatorInputSchema
>;

const platformOperatorAuthorizationSubject = `actor-type:${actorType.platformOperator}`;

const buildAdminOperatorBaselineTuples = () =>
  [
    {
      namespace: authorizationNamespace.billingEntitlement,
      object: platformScope.platform,
      relation: authorizationRelation.viewer,
      subject: platformOperatorAuthorizationSubject,
    },
    {
      namespace: authorizationNamespace.billingEntitlement,
      object: platformScope.platform,
      relation: authorizationRelation.admin,
      subject: platformOperatorAuthorizationSubject,
    },
    {
      namespace: authorizationNamespace.module,
      object: platformModuleId.workflowJobs,
      relation: authorizationRelation.admin,
      subject: platformOperatorAuthorizationSubject,
    },
    {
      namespace: authorizationNamespace.module,
      object: platformModuleId.retentionLegalHold,
      relation: authorizationRelation.admin,
      subject: platformOperatorAuthorizationSubject,
    },
    {
      namespace: authorizationNamespace.module,
      object: platformModuleId.webhooksApiAccess,
      relation: authorizationRelation.admin,
      subject: platformOperatorAuthorizationSubject,
    },
    {
      namespace: authorizationNamespace.module,
      object: platformModuleId.notificationCenter,
      relation: authorizationRelation.admin,
      subject: platformOperatorAuthorizationSubject,
    },
    {
      namespace: authorizationNamespace.module,
      object: platformModuleId.emailDelivery,
      relation: authorizationRelation.admin,
      subject: platformOperatorAuthorizationSubject,
    },
    {
      namespace: authorizationNamespace.brandingProfile,
      object: [
        platformModuleId.tenantBranding,
        platformScope.platform,
        platformScope.platform,
      ].join(":"),
      relation: authorizationRelation.admin,
      subject: platformOperatorAuthorizationSubject,
    },
  ] as const;

const decodeEnvironment = Schema.decodeUnknown(
  ProvisionAdminOperatorEnvironmentSchema,
);

const decodeKeycloakUserMatch = Schema.decodeUnknown(KeycloakUserMatchSchema);
const decodeKeycloakClientMatch = Schema.decodeUnknown(
  KeycloakClientMatchSchema,
);

const removeLeadingDoubleDash = (argv: readonly string[]) =>
  argv[0] === "--" ? argv.slice(1) : argv;

const splitDisplayName = (name: string) => {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return {
    firstName: parts[0] ?? name,
    lastName: parts.slice(1).join(" ") || "Operator",
  };
};

const generatePassword = () =>
  `Adm_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}!aA1`;

const parseProvisionAdminOperatorInput = (
  argv: readonly string[],
): Effect.Effect<
  ProvisionAdminOperatorInput,
  | ParseResult.ParseError
  | {
      readonly _tag: "ToolingScriptConfigurationError";
      readonly key: string;
      readonly message: string;
    }
> => {
  const args = removeLeadingDoubleDash(argv);
  const flags = new Map<string, string>();

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];

    if (key === undefined || !key.startsWith("--")) {
      return Effect.fail({
        _tag: "ToolingScriptConfigurationError",
        key: "argv",
        message:
          "Arguments must use --name <value>, --email <value>, and optional --username/--password pairs.",
      } as const);
    }

    if (value === undefined || value.startsWith("--")) {
      return Effect.fail({
        _tag: "ToolingScriptConfigurationError",
        key,
        message: `Missing value for ${key}.`,
      } as const);
    }

    flags.set(key, value);
  }

  const name = flags.get("--name");
  const email = flags.get("--email");
  const username = flags.get("--username") ?? email;
  const password = flags.get("--password") ?? generatePassword();

  return Schema.decodeUnknown(ProvisionAdminOperatorInputSchema)({
    name,
    email,
    username,
    password,
    actorType: actorType.platformOperator,
  });
};

const seedAdminOperatorAuthorizationTuples = (
  environment: ProvisionAdminOperatorEnvironment,
) =>
  makeOryKetoAdapter({
    readUrl: environment.KETO_READ_URL,
    writeUrl: environment.KETO_WRITE_URL,
  }).pipe(
    Effect.flatMap((oryKeto) =>
      Effect.forEach(buildAdminOperatorBaselineTuples(), (tuple) =>
        oryKeto.writeTuple(tuple),
      ),
    ),
  );

const verifyProvisionedOperator = (
  environment: ProvisionAdminOperatorEnvironment,
  input: ProvisionAdminOperatorInput,
  expectedActorType: ActorType,
) =>
  makeKeycloakAdapter({
    baseUrl: environment.KEYCLOAK_BASE_URL,
    realm: environment.KEYCLOAK_REALM,
    clientId: environment.KEYCLOAK_CLIENT_ID,
    clientSecret: environment.KEYCLOAK_CLIENT_SECRET,
  }).pipe(
    Effect.flatMap((keycloak) =>
      keycloak.issueIdTokenWithPasswordGrant({
        username: input.username,
        password: input.password,
      }),
    ),
    Effect.flatMap((token) =>
      Effect.try({
        try: () =>
          JSON.parse(
            Buffer.from(token.split(".")[1] ?? "", "base64url").toString(
              "utf8",
            ),
          ) as Record<string, unknown>,
        catch: () => ({
          _tag: "ToolingScriptConfigurationError",
          key: "KEYCLOAK_CLIENT_ID",
          message: "Failed to decode the provisioned operator identity token.",
        }),
      }).pipe(
        Effect.flatMap((payload) =>
          payload[identityClaimKey.actorType] === expectedActorType
            ? Effect.succeed(undefined)
            : Effect.fail({
                _tag: "ToolingScriptConfigurationError",
                key: identityClaimKey.actorType,
                message:
                  "Provisioned operator token did not carry the expected platform-operator actor-type claim.",
              } as const),
        ),
      ),
    ),
  );

const printUsage = () => {
  console.log(
    'Usage: bun run ops:keycloak:provision-admin-operator -- --name "Operator Name" --email operator@example.com [--username operator@example.com] [--password <value>]',
  );
};

const buildBootstrapRequestContext = (input: {
  readonly actorId: string;
  readonly email: string;
}) => ({
  actorType: actorType.platformOperator,
  actorId: input.actorId,
  sessionId: "ops:keycloak:provision-admin-operator",
  correlationId: `ops-keycloak-provision-admin-operator:${crypto.randomUUID()}`,
  reason: `Bootstrap initial admin owner for ${input.email}`,
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
});

const main = Effect.gen(function* () {
  const argv = removeLeadingDoubleDash(Bun.argv.slice(2));

  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    return;
  }

  const environment = yield* decodeEnvironment(Bun.env);
  const input = yield* parseProvisionAdminOperatorInput(argv);
  const { firstName, lastName } = splitDisplayName(input.name);

  console.log("Requesting a Keycloak admin session...");
  const adminAccessToken = yield* issueKeycloakPasswordGrant({
    baseUrl: environment.KEYCLOAK_BASE_URL,
    realm: "master",
    clientId: "admin-cli",
    username: environment.KEYCLOAK_ADMIN,
    password: environment.KEYCLOAK_ADMIN_PASSWORD,
  });

  const keycloakHeaders = createKeycloakAdminHeaders(adminAccessToken);
  const keycloakClientMatches = yield* requestJson({
    operation: "keycloak.lookupAdminOperatorClient",
    url: buildExactMatchUrl(
      environment.KEYCLOAK_BASE_URL,
      `/admin/realms/${environment.KEYCLOAK_REALM}/clients`,
      "clientId",
      environment.KEYCLOAK_CLIENT_ID,
    ),
    init: {
      headers: keycloakHeaders,
    },
    decode: decodeKeycloakClientMatch,
  });
  const keycloakClient = keycloakClientMatches[0];

  if (keycloakClient === undefined) {
    return yield* Effect.fail({
      _tag: "ToolingScriptConfigurationError",
      key: "KEYCLOAK_CLIENT_ID",
      message: `Keycloak client "${environment.KEYCLOAK_CLIENT_ID}" was not found in realm "${environment.KEYCLOAK_REALM}".`,
    } as const);
  }

  console.log("Ensuring Keycloak actor-type claim configuration...");
  yield* ensureKeycloakActorTypeClaimConfiguration({
    baseUrl: environment.KEYCLOAK_BASE_URL,
    realm: environment.KEYCLOAK_REALM,
    clientId: keycloakClient.id,
    headers: keycloakHeaders,
  });
  const userLookupUrl = buildExactMatchUrl(
    environment.KEYCLOAK_BASE_URL,
    `/admin/realms/${environment.KEYCLOAK_REALM}/users`,
    "username",
    input.username,
  );

  const existingUsers = yield* requestJson({
    operation: "keycloak.lookupAdminOperator",
    url: userLookupUrl,
    init: {
      headers: keycloakHeaders,
    },
    decode: decodeKeycloakUserMatch,
  });

  if (existingUsers[0] === undefined) {
    console.log("Creating Keycloak operator identity...");
    yield* requestEmpty({
      operation: "keycloak.createAdminOperator",
      url: new URL(
        `/admin/realms/${environment.KEYCLOAK_REALM}/users`,
        environment.KEYCLOAK_BASE_URL,
      ).toString(),
      init: {
        method: "POST",
        headers: {
          ...keycloakHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: input.username,
          email: input.email,
          firstName,
          lastName,
          enabled: true,
          emailVerified: true,
        }),
      },
    });
  } else {
    console.log("Updating existing Keycloak operator identity...");
  }

  const ensuredUsers = yield* requestJson({
    operation: "keycloak.ensureAdminOperator",
    url: userLookupUrl,
    init: {
      headers: keycloakHeaders,
    },
    decode: decodeKeycloakUserMatch,
  });

  const user = ensuredUsers[0];

  if (user === undefined) {
    return yield* Effect.fail({
      _tag: "ToolingScriptConfigurationError",
      key: "--username",
      message:
        "Failed to create or locate the requested admin operator in Keycloak.",
    } as const);
  }

  console.log("Ensuring the initial admin-app owner membership exists...");
  const adminOwner = yield* runAdminOrganizationFromEnvironment(
    Bun.env,
    (adminOrganization) =>
      adminOrganization.seedInitialOwner({
        requestContext: buildBootstrapRequestContext({
          actorId: user.id,
          email: input.email,
        }),
        keycloakSubjectId: user.id,
        email: input.email,
        displayName: input.name,
      }),
  );

  yield* requestEmpty({
    operation: "keycloak.updateAdminOperatorProfile",
    url: new URL(
      `/admin/realms/${environment.KEYCLOAK_REALM}/users/${user.id}`,
      environment.KEYCLOAK_BASE_URL,
    ).toString(),
    init: {
      method: "PUT",
      headers: {
        ...keycloakHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: user.id,
        username: input.username,
        email: input.email,
        firstName,
        lastName,
        attributes: {
          [identityClaimKey.actorType]: [input.actorType],
        },
        enabled: true,
        emailVerified: true,
      }),
    },
  });

  yield* requestEmpty({
    operation: "keycloak.resetAdminOperatorPassword",
    url: new URL(
      `/admin/realms/${environment.KEYCLOAK_REALM}/users/${user.id}/reset-password`,
      environment.KEYCLOAK_BASE_URL,
    ).toString(),
    init: {
      method: "PUT",
      headers: {
        ...keycloakHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        temporary: false,
        type: "password",
        value: input.password,
      }),
    },
  });
  console.log("Verifying the provisioned operator identity token...");
  yield* verifyProvisionedOperator(
    environment,
    input,
    actorType.platformOperator,
  );
  console.log("Seeding platform-operator authorization tuples...");
  yield* seedAdminOperatorAuthorizationTuples(environment);

  console.log("Admin operator provisioning completed.");
  console.log(`- Realm: ${environment.KEYCLOAK_REALM}`);
  console.log(`- Username: ${input.username}`);
  console.log(`- Email: ${input.email}`);
  console.log(`- Actor type: ${input.actorType}`);
  console.log(`- Admin org role: ${adminOwner.role}`);
  console.log(`- Admin org member id: ${adminOwner.id}`);
  console.log(
    `- Authorization subject: ${platformOperatorAuthorizationSubject}`,
  );
  console.log(`- Password: ${input.password}`);
  console.log(
    `- Sign-in URL: ${new URL("/sign-in", environment.ADMIN_APP_BASE_URL).toString()}`,
  );
});

try {
  await Effect.runPromise(main);
} catch (error) {
  printToolingScriptError(error);
  process.exit(1);
}
