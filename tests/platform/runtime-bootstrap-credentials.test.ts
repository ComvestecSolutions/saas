import {
  buildGlitchtipBootstrapScript,
  buildOpenPanelOperatorStateSql,
  buildOpenPanelBootstrapSql,
  buildPostalOperatorValidationScript,
  buildUnleashOperatorBootstrapSql,
  buildUnleashBackendTokenReconcileSql,
  buildPostalBootstrapScript,
  extractGlitchtipBootstrapResult,
  extractNovuApiKey,
  extractNovuSessionToken,
  extractOpenPanelOperatorAuthState,
  extractOpenPanelBootstrapResult,
  extractPostalOperatorLoginState,
  extractPostalBootstrapResult,
  extractUnleashOperatorAuthState,
  selectUnleashBackendApiToken,
  shouldBootstrapRuntimeCredential,
} from "../../tooling/scripts/ops/bootstrap-runtime-credentials";
import { unleashBackendClientName } from "../../packages/platform/src/adapters/features-billing/unleash-shared";

describe("runtime bootstrap credentials", () => {
  it("treats placeholder and generated values as needing bootstrap", () => {
    expect(shouldBootstrapRuntimeCredential(undefined)).toBe(true);
    expect(shouldBootstrapRuntimeCredential("")).toBe(true);
    expect(
      shouldBootstrapRuntimeCredential("set-in-local-env__novu_password"),
    ).toBe(true);
    expect(
      shouldBootstrapRuntimeCredential(
        "generate-after-running-ops-runtime-bootstrap",
      ),
    ).toBe(true);
    expect(shouldBootstrapRuntimeCredential("real-runtime-key")).toBe(false);
  });

  it("extracts Novu session tokens from auth responses", () => {
    expect(extractNovuSessionToken({ token: "Bearer top-level-token" })).toBe(
      "Bearer top-level-token",
    );
    expect(extractNovuSessionToken({ data: { token: "nested-token" } })).toBe(
      "Bearer nested-token",
    );
  });

  it("extracts Novu API keys from list and regenerate responses", () => {
    expect(extractNovuApiKey([{ key: "novu_api_1" }])).toBe("novu_api_1");
    expect(extractNovuApiKey({ data: [{ key: "novu_api_2" }] })).toBe(
      "novu_api_2",
    );
    expect(
      extractNovuApiKey({
        data: [
          {
            _id: "env_1",
            apiKeys: [{ key: "novu_api_3" }],
          },
        ],
      }),
    ).toBe("novu_api_3");
  });

  it("extracts the Postal bootstrap result from noisy console output", () => {
    expect(
      extractPostalBootstrapResult(
        [
          "Loading production environment (Rails 7.2.2)",
          '{"email":"postal.operator@local.test","serverName":"Local Backend","apiKey":"postal-api-key"}',
          "=> nil",
        ].join("\n"),
      ),
    ).toEqual({
      apiKey: "postal-api-key",
      email: "postal.operator@local.test",
      serverName: "Local Backend",
    });
  });

  it("builds a Postal bootstrap script with escaped operator details", () => {
    const script = buildPostalBootstrapScript({
      email: "postal.operator@local.test",
      password: "PostalStrongPass123!",
      firstName: "O'Brien",
      lastName: "Operator",
      organizationName: "Local Postal",
      serverName: "Local Backend",
      credentialName: "backend-api",
    });

    expect(script).toContain(
      'credential_name = config.fetch("credentialName")',
    );
    expect(script).toContain("O\\\\'Brien");
    expect(script).toContain("server.credentials.create!");
  });

  it("extracts the OpenPanel bootstrap result from psql output", () => {
    expect(
      extractOpenPanelBootstrapResult(
        [
          "NOTICE: using existing organization",
          '{"clientId":"7fb0c540-a6ba-4f42-8f9c-8cb28dd2fdce","clientSecret":"openpanel-secret","organizationId":"comvestec-local","projectId":"proj_1"}',
        ].join("\n"),
      ),
    ).toEqual({
      clientId: "7fb0c540-a6ba-4f42-8f9c-8cb28dd2fdce",
      clientSecret: "openpanel-secret",
      organizationId: "comvestec-local",
      projectId: "proj_1",
    });
  });

  it("builds OpenPanel bootstrap SQL that provisions or reuses a backend client", () => {
    const sql = buildOpenPanelBootstrapSql({
      organizationId: "comvestec-local",
      organizationName: "Comvestec O'Brien",
      projectName: "Comvestec SaaS Foundation",
      clientName: "Backend Writer",
      operatorEmail: "openpanel.operator@local.test",
      operatorPasswordHash: "$argon2id$hashed",
      operatorFirstName: "OpenPanel",
      operatorLastName: "Operator",
    });

    expect(sql).toContain(
      'INSERT INTO users (id, email, "firstName", "lastName")',
    );
    expect(sql).toContain(
      'INSERT INTO accounts (id, "userId", provider, "providerId", email, password)',
    );
    expect(sql).toContain(
      'INSERT INTO organizations (id, name, "createdByUserId")',
    );
    expect(sql).toContain(
      'INSERT INTO clients (name, secret, "projectId", "organizationId", type, "ignoreCorsAndSecret")',
    );
    expect(sql).toContain("replace(gen_random_uuid()::text, '-', '')");
    expect(sql).toContain("Comvestec O''Brien");
    expect(sql).toContain("'org:admin'");
    expect(sql).toContain("$argon2id$hashed");
  });

  it("extracts the OpenPanel operator auth state from psql output", () => {
    expect(
      extractOpenPanelOperatorAuthState(
        [
          "NOTICE: using existing operator",
          '{"email":"openpanel.operator@local.test","passwordHash":"$argon2id$hashed","accountProvider":"email","memberRole":"org:admin","organizationId":"comvestec-local"}',
        ].join("\n"),
      ),
    ).toEqual({
      email: "openpanel.operator@local.test",
      passwordHash: "$argon2id$hashed",
      accountProvider: "email",
      memberRole: "org:admin",
      organizationId: "comvestec-local",
    });
  });

  it("builds OpenPanel operator state SQL against the repo-owned operator email", () => {
    const sql = buildOpenPanelOperatorStateSql("openpanel.operator@local.test");

    expect(sql).toContain("SELECT json_build_object(");
    expect(sql).toContain("passwordHash");
    expect(sql).toContain("accountProvider");
    expect(sql).toContain("memberRole");
  });

  it("extracts the GlitchTip bootstrap result from shell output", () => {
    expect(
      extractGlitchtipBootstrapResult(
        [
          "Using existing organization",
          '{"dsn":"https://public:secret@localhost/1","operatorEmail":"operator@local.test","organizationSlug":"comvestec-local","projectSlug":"comvestec-saas-foundation","teamSlug":"platform"}',
        ].join("\n"),
      ),
    ).toEqual({
      dsn: "https://public:secret@localhost/1",
      operatorEmail: "operator@local.test",
      organizationSlug: "comvestec-local",
      projectSlug: "comvestec-saas-foundation",
      teamSlug: "platform",
    });
  });

  it("builds a GlitchTip bootstrap script with escaped configuration and app lookups", () => {
    const script = buildGlitchtipBootstrapScript({
      operatorEmail: "glitchtip.operator@local.test",
      operatorPassword: "GlitchTipStrongPass123!",
      operatorName: "GlitchTip Operator",
      organizationSlug: "comvestec-local",
      organizationName: "Comvestec O'Brien",
      teamSlug: "platform",
      projectSlug: "comvestec-saas-foundation",
      projectName: "Comvestec SaaS Foundation",
      projectKeyName: "Backend Key",
    });

    expect(script).toContain(
      "apps.get_model('organizations_ext', 'Organization')",
    );
    expect(script).toContain("apps.get_model('account', 'EmailAddress')");
    expect(script).toContain("apps.get_model('projects', 'ProjectKey')");
    expect(script).toContain("authenticate(email=config['operatorEmail']");
    expect(script).toContain("Comvestec O\\'Brien");
    expect(script).toContain("project_key.get_dsn()");
  });

  it("extracts the Postal operator login state from console output", () => {
    expect(
      extractPostalOperatorLoginState(
        [
          "Loading production environment (Rails 7.2.2)",
          '{"email":"postal.operator@local.test","authenticated":true}',
          "=> nil",
        ].join("\n"),
      ),
    ).toEqual({
      email: "postal.operator@local.test",
      authenticated: true,
    });
  });

  it("builds a Postal operator validation script", () => {
    const script = buildPostalOperatorValidationScript({
      email: "postal.operator@local.test",
      password: "PostalStrongPass123!",
    });

    expect(script).toContain('email = config.fetch("email")');
    expect(script).toContain("user.authenticate(password)");
    expect(script).toContain("authenticated");
  });

  it("prefers the configured Unleash bootstrap token as the repo-owned backend token", () => {
    expect(
      selectUnleashBackendApiToken({
        configuredApiKey: "default:development.stale-runtime-token",
        configuredBootstrapToken: "default:development.current-backend-token",
      }),
    ).toBe("default:development.current-backend-token");
  });

  it("falls back to the Unleash runtime key when the bootstrap token is still a placeholder", () => {
    expect(
      selectUnleashBackendApiToken({
        configuredApiKey: "default:development.current-backend-token",
        configuredBootstrapToken:
          "default:development.set-in-local-env__unleash_backend_token",
      }),
    ).toBe("default:development.current-backend-token");
  });

  it("builds the Unleash token reconcile SQL for the repo-owned backend token", () => {
    const sql = buildUnleashBackendTokenReconcileSql(
      "default:development.backend-'token",
    );

    expect(sql).toContain(
      `DELETE FROM api_tokens WHERE type = 'backend' AND environment = 'development' AND token_name = '${unleashBackendClientName}';`,
    );
    expect(sql).toContain(
      `VALUES ('default:development.backend-''token', '${unleashBackendClientName}', 'backend', 'development', '${unleashBackendClientName}')`,
    );
  });

  it("extracts the Unleash operator auth state from psql output", () => {
    expect(
      extractUnleashOperatorAuthState(
        [
          "UPDATE 1",
          '{"email":"unleash.operator@example.com","username":"unleash.operator.local","passwordHash":"$2b$10$hashed","hasAdminRole":true}',
        ].join("\n"),
      ),
    ).toEqual({
      email: "unleash.operator@example.com",
      username: "unleash.operator.local",
      passwordHash: "$2b$10$hashed",
      hasAdminRole: true,
    });
  });

  it("builds Unleash operator bootstrap SQL with the Admin role assignment", () => {
    const sql = buildUnleashOperatorBootstrapSql({
      operatorName: "Unleash O'Brien",
      operatorEmail: "unleash.operator@example.com",
      operatorUsername: "unleash.operator.local",
      operatorPasswordHash: "$2b$10$hashed",
    });

    expect(sql).toContain(
      "INSERT INTO users (name, email, username, password_hash",
    );
    expect(sql).toContain("INSERT INTO role_user (role_id, user_id, project)");
    expect(sql).toContain("Unleash O''Brien");
    expect(sql).toContain("'Admin'");
    expect(sql).toContain("$2b$10$hashed");
  });
});
