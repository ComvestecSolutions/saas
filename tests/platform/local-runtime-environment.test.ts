import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildBootstrapState,
  buildBootstrapManagedValues,
  mergeLegacyEnvSecretEntriesIntoVaultData,
  selectLegacyEnvSecretEntriesToMigrate,
} from "../../tooling/scripts/ops/bootstrap-local-secrets";
import {
  buildLocalRuntimeVaultPolicy,
  buildVaultRequestFailureMessage,
  collectConcreteEnvFileSecretEntries,
  defaultVaultLocalRuntimeTokenFilePath,
  defaultVaultLocalRuntimeTokenSource,
  defaultVaultRootTokenFilePath,
  ensureLocalRuntimeVaultToken,
  isPlaceholderValue,
  mergeResolvedLocalRuntimeEnvironmentValues,
  resolveLocalRuntimeEnvironment,
  selectPreferredVaultTokenFilePath,
  scrubConcreteSecretValuesFromEnvFileContents,
} from "../../tooling/scripts/ops/local-runtime-environment";

const novuPasswordPattern =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[#?!@$%^&*()-])[A-Za-z\d#?!@$%^&*()-]{8,64}$/;

describe("local runtime environment resolution", () => {
  it("uses shell values when tracked defaults are still placeholders", async () => {
    const tempDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-runtime-no-vault-token-"),
    );
    const missingVaultTokenFilePath = join(tempDirectoryPath, ".vault-token");
    const originalVaultToken = process.env.VAULT_TOKEN;
    const originalVaultTokenFile = process.env.VAULT_TOKEN_FILE;

    try {
      delete process.env.VAULT_TOKEN;
      process.env.VAULT_TOKEN_FILE = missingVaultTokenFilePath;

      const resolution = await resolveLocalRuntimeEnvironment({
        envFile: ".env.example",
        allowMissingVault: true,
        shellValues: {
          POLAR_ACCESS_TOKEN: "polar-token-from-shell",
        },
      });

      expect(resolution.values.POLAR_ACCESS_TOKEN).toBe(
        "polar-token-from-shell",
      );
    } finally {
      if (originalVaultToken === undefined) {
        delete process.env.VAULT_TOKEN;
      } else {
        process.env.VAULT_TOKEN = originalVaultToken;
      }

      if (originalVaultTokenFile === undefined) {
        delete process.env.VAULT_TOKEN_FILE;
      } else {
        process.env.VAULT_TOKEN_FILE = originalVaultTokenFile;
      }

      rmSync(tempDirectoryPath, {
        force: true,
        recursive: true,
      });
    }
  });

  it("keeps non-secret env-file values ahead of shell overrides", async () => {
    const tempDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-runtime-env-"),
    );
    const envFilePath = join(tempDirectoryPath, "runtime.env");

    try {
      writeFileSync(envFilePath, "PUBLIC_WEB_PORT=3100\n");

      const resolution = await resolveLocalRuntimeEnvironment({
        envFile: envFilePath,
        allowMissingVault: true,
        shellValues: {
          PUBLIC_WEB_PORT: "3999",
        },
      });

      expect(resolution.values.PUBLIC_WEB_PORT).toBe("3100");
    } finally {
      rmSync(tempDirectoryPath, {
        force: true,
        recursive: true,
      });
    }
  });

  it("still reads existing Vault data when allowMissingVault is true and Vault is reachable", async () => {
    const tempDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-runtime-optional-vault-read-"),
    );
    const envFilePath = join(tempDirectoryPath, "runtime.env");
    const originalVaultToken = process.env.VAULT_TOKEN;
    const originalFetch = global.fetch;

    try {
      writeFileSync(envFilePath, "VAULT_ADDR=http://configured-vault:8200\n");
      process.env.VAULT_TOKEN = "local-test-token";

      const fetchSpy = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                data: {
                  POLAR_ACCESS_TOKEN: "vault-token",
                },
              },
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
      );

      global.fetch = fetchSpy as typeof fetch;

      const resolution = await resolveLocalRuntimeEnvironment({
        envFile: envFilePath,
        allowMissingVault: true,
      });

      expect(resolution.vaultWasFound).toBe(true);
      expect(resolution.vaultData).toEqual(
        expect.objectContaining({
          POLAR_ACCESS_TOKEN: "vault-token",
        }),
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://configured-vault:8200/v1/platform/data/local-ops/runtime-env",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Vault-Token": "local-test-token",
          }),
        }),
      );
    } finally {
      global.fetch = originalFetch;

      if (originalVaultToken === undefined) {
        delete process.env.VAULT_TOKEN;
      } else {
        process.env.VAULT_TOKEN = originalVaultToken;
      }

      rmSync(tempDirectoryPath, {
        force: true,
        recursive: true,
      });
    }
  });

  it("prefers the scoped local-runtime token file ahead of the root token file by default", () => {
    expect(
      selectPreferredVaultTokenFilePath({
        existingTokenFilePaths: [
          defaultVaultLocalRuntimeTokenFilePath,
          defaultVaultRootTokenFilePath,
        ],
      }),
    ).toBe(defaultVaultLocalRuntimeTokenFilePath);
    expect(
      selectPreferredVaultTokenFilePath({
        explicitTokenFilePath: "C:\\vault\\explicit-token.txt",
        existingTokenFilePaths: [
          defaultVaultLocalRuntimeTokenFilePath,
          defaultVaultRootTokenFilePath,
        ],
      }),
    ).toBe("C:\\vault\\explicit-token.txt");
    expect(
      selectPreferredVaultTokenFilePath({
        existingTokenFilePaths: [defaultVaultRootTokenFilePath],
      }),
    ).toBe(defaultVaultLocalRuntimeTokenFilePath);
  });

  it("builds the scoped local-runtime Vault policy with single-path read/write access", () => {
    expect(buildLocalRuntimeVaultPolicy()).toBe(
      [
        'path "platform/data/local-ops/runtime-env" {',
        '  capabilities = ["create", "read", "update"]',
        "}",
        "",
        'path "platform/metadata/local-ops/runtime-env" {',
        '  capabilities = ["read"]',
        "}",
      ].join("\n"),
    );
  });

  it("creates or refreshes the scoped local-runtime Vault token when a bootstrap token is available", async () => {
    const tempDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-runtime-token-bootstrap-"),
    );
    const tokenFilePath = join(tempDirectoryPath, "vault-local-runtime-token");
    const originalBootstrapToken = process.env.VAULT_BOOTSTRAP_TOKEN;
    const originalFetch = global.fetch;

    try {
      process.env.VAULT_BOOTSTRAP_TOKEN = "bootstrap-root-token";

      const fetchSpy = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              auth: {
                client_token: "scoped-local-runtime-token",
              },
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
        );

      global.fetch = fetchSpy as typeof fetch;

      const result = await ensureLocalRuntimeVaultToken({
        vaultAddress: "http://configured-vault:8200",
        tokenFilePath,
      });

      expect(result.tokenFilePath).toBe(tokenFilePath);
      expect(readFileSync(tokenFilePath, "utf8").trim()).toBe(
        "scoped-local-runtime-token",
      );
      expect(fetchSpy).toHaveBeenNthCalledWith(
        1,
        "http://configured-vault:8200/v1/sys/policies/acl/comvestec-local-runtime",
        expect.objectContaining({
          method: "PUT",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-Vault-Token": "bootstrap-root-token",
          }),
          body: JSON.stringify({
            policy: buildLocalRuntimeVaultPolicy(),
          }),
        }),
      );
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        "http://configured-vault:8200/v1/auth/token/create",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-Vault-Token": "bootstrap-root-token",
          }),
          body: JSON.stringify({
            display_name: "comvestec-local-runtime",
            renewable: true,
            policies: ["comvestec-local-runtime"],
            meta: {
              purpose: "local-runtime-env",
              vaultPath: "platform/local-ops/runtime-env",
            },
          }),
        }),
      );
    } finally {
      global.fetch = originalFetch;

      if (originalBootstrapToken === undefined) {
        delete process.env.VAULT_BOOTSTRAP_TOKEN;
      } else {
        process.env.VAULT_BOOTSTRAP_TOKEN = originalBootstrapToken;
      }

      rmSync(tempDirectoryPath, {
        force: true,
        recursive: true,
      });
    }
  });

  it("uses the bootstrap token path for first-run Vault writes", async () => {
    const tempHomeDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-runtime-bootstrap-home-"),
    );
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    const originalVaultToken = process.env.VAULT_TOKEN;
    const originalVaultTokenFile = process.env.VAULT_TOKEN_FILE;
    const originalBootstrapToken = process.env.VAULT_BOOTSTRAP_TOKEN;
    const originalBootstrapTokenFile = process.env.VAULT_BOOTSTRAP_TOKEN_FILE;
    const originalFetch = global.fetch;

    try {
      process.env.HOME = tempHomeDirectoryPath;
      process.env.USERPROFILE = tempHomeDirectoryPath;
      delete process.env.VAULT_TOKEN;
      delete process.env.VAULT_TOKEN_FILE;
      delete process.env.VAULT_BOOTSTRAP_TOKEN;
      delete process.env.VAULT_BOOTSTRAP_TOKEN_FILE;
      writeFileSync(
        join(tempHomeDirectoryPath, ".vault-token"),
        "break-glass-root-token\n",
      );

      const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));

      global.fetch = fetchSpy as typeof fetch;
      vi.resetModules();

      const { writeVaultKvRecord: writeVaultKvRecordWithTempHome } =
        await import("../../tooling/scripts/ops/local-runtime-environment");

      await writeVaultKvRecordWithTempHome({
        data: {
          POLAR_ACCESS_TOKEN: "polar-token-from-bootstrap",
        },
        tokenMode: "bootstrap",
        vaultAddress: "http://configured-vault:8200",
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://configured-vault:8200/v1/platform/data/local-ops/runtime-env",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-Vault-Token": "break-glass-root-token",
          }),
          body: JSON.stringify({
            data: {
              POLAR_ACCESS_TOKEN: "polar-token-from-bootstrap",
            },
          }),
        }),
      );
    } finally {
      global.fetch = originalFetch;

      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }

      if (originalUserProfile === undefined) {
        delete process.env.USERPROFILE;
      } else {
        process.env.USERPROFILE = originalUserProfile;
      }

      if (originalVaultToken === undefined) {
        delete process.env.VAULT_TOKEN;
      } else {
        process.env.VAULT_TOKEN = originalVaultToken;
      }

      if (originalVaultTokenFile === undefined) {
        delete process.env.VAULT_TOKEN_FILE;
      } else {
        process.env.VAULT_TOKEN_FILE = originalVaultTokenFile;
      }

      if (originalBootstrapToken === undefined) {
        delete process.env.VAULT_BOOTSTRAP_TOKEN;
      } else {
        process.env.VAULT_BOOTSTRAP_TOKEN = originalBootstrapToken;
      }

      if (originalBootstrapTokenFile === undefined) {
        delete process.env.VAULT_BOOTSTRAP_TOKEN_FILE;
      } else {
        process.env.VAULT_BOOTSTRAP_TOKEN_FILE = originalBootstrapTokenFile;
      }

      vi.resetModules();
      rmSync(tempHomeDirectoryPath, {
        force: true,
        recursive: true,
      });
    }
  });

  it("reads existing Vault data through the bootstrap token path for bootstrap reruns", async () => {
    const tempHomeDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-runtime-bootstrap-read-home-"),
    );
    const envFilePath = join(tempHomeDirectoryPath, "runtime.env");
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    const originalVaultToken = process.env.VAULT_TOKEN;
    const originalVaultTokenFile = process.env.VAULT_TOKEN_FILE;
    const originalBootstrapToken = process.env.VAULT_BOOTSTRAP_TOKEN;
    const originalBootstrapTokenFile = process.env.VAULT_BOOTSTRAP_TOKEN_FILE;
    const originalFetch = global.fetch;

    try {
      process.env.HOME = tempHomeDirectoryPath;
      process.env.USERPROFILE = tempHomeDirectoryPath;
      delete process.env.VAULT_TOKEN;
      delete process.env.VAULT_TOKEN_FILE;
      delete process.env.VAULT_BOOTSTRAP_TOKEN;
      delete process.env.VAULT_BOOTSTRAP_TOKEN_FILE;
      writeFileSync(envFilePath, "VAULT_ADDR=http://configured-vault:8200\n");
      writeFileSync(
        join(tempHomeDirectoryPath, ".vault-token"),
        "break-glass-root-token\n",
      );

      const fetchSpy = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                data: {
                  OPENPANEL_CLIENT_SECRET: "preserved-runtime-generated-secret",
                  POLAR_ACCESS_TOKEN: "preserved-polar-token",
                },
              },
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
      );

      global.fetch = fetchSpy as typeof fetch;
      vi.resetModules();

      const {
        resolveLocalRuntimeEnvironment:
          resolveLocalRuntimeEnvironmentWithBootstrapToken,
      } = await import("../../tooling/scripts/ops/local-runtime-environment");

      const resolution = await resolveLocalRuntimeEnvironmentWithBootstrapToken(
        {
          allowMissingVault: true,
          envFile: envFilePath,
          vaultTokenMode: "bootstrap",
        },
      );

      expect(resolution.vaultData).toEqual(
        expect.objectContaining({
          OPENPANEL_CLIENT_SECRET: "preserved-runtime-generated-secret",
          POLAR_ACCESS_TOKEN: "preserved-polar-token",
        }),
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://configured-vault:8200/v1/platform/data/local-ops/runtime-env",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Vault-Token": "break-glass-root-token",
          }),
        }),
      );
    } finally {
      global.fetch = originalFetch;

      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }

      if (originalUserProfile === undefined) {
        delete process.env.USERPROFILE;
      } else {
        process.env.USERPROFILE = originalUserProfile;
      }

      if (originalVaultToken === undefined) {
        delete process.env.VAULT_TOKEN;
      } else {
        process.env.VAULT_TOKEN = originalVaultToken;
      }

      if (originalVaultTokenFile === undefined) {
        delete process.env.VAULT_TOKEN_FILE;
      } else {
        process.env.VAULT_TOKEN_FILE = originalVaultTokenFile;
      }

      if (originalBootstrapToken === undefined) {
        delete process.env.VAULT_BOOTSTRAP_TOKEN;
      } else {
        process.env.VAULT_BOOTSTRAP_TOKEN = originalBootstrapToken;
      }

      if (originalBootstrapTokenFile === undefined) {
        delete process.env.VAULT_BOOTSTRAP_TOKEN_FILE;
      } else {
        process.env.VAULT_BOOTSTRAP_TOKEN_FILE = originalBootstrapTokenFile;
      }

      vi.resetModules();
      rmSync(tempHomeDirectoryPath, {
        force: true,
        recursive: true,
      });
    }
  });

  it("surfaces stale scoped-token guidance without instructing runtime reads to reuse the root token", () => {
    expect(
      buildVaultRequestFailureMessage({
        operation: "read",
        vaultPath: "platform/local-ops/runtime-env",
        response: new Response(null, {
          status: 403,
          statusText: "Forbidden",
        }),
        tokenSource: defaultVaultLocalRuntimeTokenSource,
      }),
    ).toContain("bun run ops:secrets:bootstrap");
    expect(
      buildVaultRequestFailureMessage({
        operation: "read",
        vaultPath: "platform/local-ops/runtime-env",
        response: new Response(null, {
          status: 403,
          statusText: "Forbidden",
        }),
        tokenSource: defaultVaultLocalRuntimeTokenSource,
      }),
    ).toContain("VAULT_BOOTSTRAP_TOKEN / VAULT_BOOTSTRAP_TOKEN_FILE");
    expect(
      buildVaultRequestFailureMessage({
        operation: "read",
        vaultPath: "platform/local-ops/runtime-env",
        response: new Response(null, {
          status: 403,
          statusText: "Forbidden",
        }),
        tokenSource: defaultVaultLocalRuntimeTokenSource,
      }),
    ).not.toContain("silently");
  });

  it("fails closed when only the break-glass root token file exists", async () => {
    const tempHomeDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-runtime-temp-home-"),
    );
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    const originalVaultToken = process.env.VAULT_TOKEN;
    const originalVaultTokenFile = process.env.VAULT_TOKEN_FILE;
    const originalFetch = global.fetch;

    try {
      process.env.HOME = tempHomeDirectoryPath;
      process.env.USERPROFILE = tempHomeDirectoryPath;
      delete process.env.VAULT_TOKEN;
      delete process.env.VAULT_TOKEN_FILE;
      writeFileSync(
        join(tempHomeDirectoryPath, ".vault-token"),
        "break-glass-root-token\n",
      );

      const fetchSpy = vi.fn();

      global.fetch = fetchSpy as typeof fetch;
      vi.resetModules();

      const { readVaultKvRecord } =
        await import("../../tooling/scripts/ops/local-runtime-environment");

      await expect(
        readVaultKvRecord({
          vaultAddress: "http://configured-vault:8200",
        }),
      ).rejects.toThrow(/bun run ops:secrets:bootstrap/u);
      await expect(
        readVaultKvRecord({
          vaultAddress: "http://configured-vault:8200",
        }),
      ).rejects.toThrow(/VAULT_BOOTSTRAP_TOKEN \/ VAULT_BOOTSTRAP_TOKEN_FILE/u);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;

      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }

      if (originalUserProfile === undefined) {
        delete process.env.USERPROFILE;
      } else {
        process.env.USERPROFILE = originalUserProfile;
      }

      if (originalVaultToken === undefined) {
        delete process.env.VAULT_TOKEN;
      } else {
        process.env.VAULT_TOKEN = originalVaultToken;
      }

      if (originalVaultTokenFile === undefined) {
        delete process.env.VAULT_TOKEN_FILE;
      } else {
        process.env.VAULT_TOKEN_FILE = originalVaultTokenFile;
      }

      vi.resetModules();
      rmSync(tempHomeDirectoryPath, {
        force: true,
        recursive: true,
      });
    }
  });

  it("rejects concrete secret values in env files", async () => {
    const tempDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-runtime-secret-env-"),
    );
    const envFilePath = join(tempDirectoryPath, "runtime.env");

    try {
      writeFileSync(
        envFilePath,
        "POLAR_ACCESS_TOKEN=polar-token-that-should-live-in-vault\n",
      );

      await expect(
        resolveLocalRuntimeEnvironment({
          envFile: envFilePath,
          allowMissingVault: true,
        }),
      ).rejects.toThrow(
        /Concrete secret values must not be stored.*POLAR_ACCESS_TOKEN/u,
      );
    } finally {
      rmSync(tempDirectoryPath, {
        force: true,
        recursive: true,
      });
    }
  });

  it("collects concrete placeholder-backed secret entries from env values", () => {
    const secretEntries = collectConcreteEnvFileSecretEntries({
      baseValues: {
        OPENPANEL_RESEND_API_KEY: "",
        POLAR_ACCESS_TOKEN: "set-from-polar-organization-access-token",
        PUBLIC_WEB_PORT: "3000",
      },
      values: {
        OPENPANEL_RESEND_API_KEY: "resend-live-api-key",
        POLAR_ACCESS_TOKEN: "polar-token-from-legacy-env",
        PUBLIC_WEB_PORT: "3100",
      },
    });

    expect(secretEntries).toEqual({
      OPENPANEL_RESEND_API_KEY: "resend-live-api-key",
      POLAR_ACCESS_TOKEN: "polar-token-from-legacy-env",
    });
  });

  it("scrubs concrete placeholder-backed secret lines from legacy env contents", () => {
    const scrubbed = scrubConcreteSecretValuesFromEnvFileContents({
      baseValues: {
        OPENPANEL_RESEND_API_KEY: "",
        POLAR_ACCESS_TOKEN: "set-from-polar-organization-access-token",
        PUBLIC_WEB_PORT: "3000",
        VAULT_ADDR: "http://localhost:8200",
      },
      fileContents: [
        "# legacy overrides",
        "VAULT_ADDR=http://localhost:8200",
        "PUBLIC_WEB_PORT=3100",
        "POLAR_ACCESS_TOKEN=polar-token-from-legacy-env",
        "OPENPANEL_RESEND_API_KEY=resend-live-api-key",
        "",
      ].join("\n"),
    });

    expect(scrubbed.removedKeys).toEqual([
      "OPENPANEL_RESEND_API_KEY",
      "POLAR_ACCESS_TOKEN",
    ]);
    expect(scrubbed.hasRetainedEntries).toBe(true);
    expect(scrubbed.contents).toContain("VAULT_ADDR=http://localhost:8200");
    expect(scrubbed.contents).toContain("PUBLIC_WEB_PORT=3100");
    expect(scrubbed.contents).not.toContain("POLAR_ACCESS_TOKEN=");
    expect(scrubbed.contents).not.toContain("OPENPANEL_RESEND_API_KEY=");
  });

  it("preserves existing concrete Vault secrets when migrating legacy env entries", () => {
    const mergedVaultData = mergeLegacyEnvSecretEntriesIntoVaultData({
      existingVaultData: {
        POLAR_ACCESS_TOKEN: "vault-token",
      },
      legacySecretEntries: {
        OPENPANEL_RESEND_API_KEY: "legacy-resend-key",
        POLAR_ACCESS_TOKEN: "legacy-polar-token",
      },
      normalizedBootstrapValues: {},
    });

    expect(mergedVaultData).toEqual({
      OPENPANEL_RESEND_API_KEY: "legacy-resend-key",
      POLAR_ACCESS_TOKEN: "vault-token",
    });
  });

  it("preserves existing runtime-generated Vault keys during bootstrap merges", () => {
    const mergedVaultData = mergeLegacyEnvSecretEntriesIntoVaultData({
      existingVaultData: {
        OPENPANEL_CLIENT_SECRET: "preserved-runtime-generated-secret",
      },
      legacySecretEntries: {},
      normalizedBootstrapValues: {
        POLAR_ACCESS_TOKEN: "bootstrap-polar-token",
      },
    });

    expect(mergedVaultData).toEqual({
      OPENPANEL_CLIENT_SECRET: "preserved-runtime-generated-secret",
      POLAR_ACCESS_TOKEN: "bootstrap-polar-token",
    });
  });

  it("prefers legacy managed secrets over placeholder Vault values during migration", () => {
    const legacySecretEntriesToMigrate = selectLegacyEnvSecretEntriesToMigrate({
      existingVaultData: {
        POSTGRES_PASSWORD: "set-in-local-env__postgres_password",
      },
      legacySecretEntries: {
        POSTGRES_PASSWORD: "LegacyStrongPass123!",
      },
    });
    const managedValues = buildBootstrapManagedValues({
      state: {
        POSTGRES_DB: "comvestec",
        POSTGRES_USER: "comvestec",
        POSTGRES_PASSWORD: "set-in-local-env__postgres_password",
        POSTGRES_PORT: "5432",
        KEYCLOAK_ADMIN: "keycloak.operator.local",
        KEYCLOAK_ADMIN_PASSWORD: "KeycloakStrongPass123!",
        KEYCLOAK_CLIENT_SECRET: "strong-keycloak-client-secret",
        KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: "ConvexServiceStrongPass123!",
        SUBSCRIBER_JOURNEY_SMOKE_USER_PASSWORD: "SmokeStrongPass123!",
        GRAFANA_ADMIN_USER: "grafana.operator.local",
        GRAFANA_ADMIN_PASSWORD: "GrafanaStrongPass123!",
        GLITCHTIP_SECRET_KEY: "strong-glitchtip-secret-key",
        UNLEASH_API_TOKEN: "default:development.strong-unleash-token",
        MEILISEARCH_MASTER_KEY: "strong-meilisearch-master-key",
        MEILISEARCH_API_KEY: "strong-meilisearch-api-key",
        OPENPANEL_POSTGRES_USER: "openpanel",
        OPENPANEL_POSTGRES_PASSWORD: "OpenPanelStrongPass123!",
        OPENPANEL_POSTGRES_DB: "openpanel",
        OPENPANEL_COOKIE_SECRET: "strong-openpanel-cookie-secret",
        POSTAL_MARIADB_PASSWORD: "PostalMariaDbStrongPass123!",
        POSTAL_RAILS_SECRET_KEY: "strong-postal-rails-secret",
        POSTAL_SIGNING_KEY_BASE64:
          "LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQpzdHJvbmcKLS0tLS1FTkQgUlNBIFBSSVZBVEUgS0VZLS0tLS0=",
        POSTAL_FNAME: "Postal",
        POSTAL_LNAME: "Operator",
        POSTAL_EMAIL: "postal.operator@local.test",
        ...legacySecretEntriesToMigrate,
      },
      existingVaultData: {
        POSTGRES_PASSWORD: "set-in-local-env__postgres_password",
      },
    });

    expect(managedValues.nextValues.POSTGRES_PASSWORD).toBe(
      "LegacyStrongPass123!",
    );
  });

  it("keeps stale non-secret legacy env values out of bootstrap state", () => {
    const bootstrapState = buildBootstrapState({
      resolvedValues: {
        POSTGRES_PASSWORD: "set-in-local-env__postgres_password",
        POSTGRES_PORT: "5432",
      },
      existingVaultData: {
        POSTGRES_PASSWORD: "set-in-local-env__postgres_password",
      },
      legacySecretEntries: {
        POSTGRES_PASSWORD: "LegacyStrongPass123!",
      },
    });

    expect(bootstrapState).toEqual({
      POSTGRES_PASSWORD: "LegacyStrongPass123!",
      POSTGRES_PORT: "5432",
    });
  });

  it("keeps current env overrides ahead of legacy migration input", () => {
    const values = mergeResolvedLocalRuntimeEnvironmentValues({
      baseValues: {
        POSTGRES_PORT: "5432",
        VAULT_ADDR: "http://tracked-default-vault:8200",
      },
      legacyDotEnvValues: {
        POSTGRES_PORT: "6432",
        VAULT_ADDR: "http://stale-legacy-vault:8200",
      },
      envOverrideValues: {
        POSTGRES_PORT: "6543",
        VAULT_ADDR: "http://current-env-local-vault:8200",
      },
      vaultValues: {},
    });

    expect(values.POSTGRES_PORT).toBe("6543");
    expect(values.VAULT_ADDR).toBe("http://current-env-local-vault:8200");
  });

  it("derives the host postgres url from the configured postgres port", () => {
    const managedValues = buildBootstrapManagedValues({
      state: {
        POSTGRES_DB: "comvestec",
        POSTGRES_USER: "comvestec",
        POSTGRES_PASSWORD: "StrongLocalPass123!",
        POSTGRES_PORT: "6543",
        KEYCLOAK_ADMIN: "keycloak.operator.local",
        KEYCLOAK_ADMIN_PASSWORD: "KeycloakStrongPass123!",
        KEYCLOAK_CLIENT_SECRET: "strong-keycloak-client-secret",
        KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: "ConvexServiceStrongPass123!",
        SUBSCRIBER_JOURNEY_SMOKE_USER_PASSWORD: "SmokeStrongPass123!",
        GRAFANA_ADMIN_USER: "grafana.operator.local",
        GRAFANA_ADMIN_PASSWORD: "GrafanaStrongPass123!",
        GLITCHTIP_SECRET_KEY: "strong-glitchtip-secret-key",
        UNLEASH_API_TOKEN: "default:development.strong-unleash-token",
        MEILISEARCH_MASTER_KEY: "strong-meilisearch-master-key",
        MEILISEARCH_API_KEY: "strong-meilisearch-api-key",
        OPENPANEL_POSTGRES_USER: "openpanel",
        OPENPANEL_POSTGRES_PASSWORD: "OpenPanelStrongPass123!",
        OPENPANEL_POSTGRES_DB: "openpanel",
        OPENPANEL_COOKIE_SECRET: "strong-openpanel-cookie-secret",
        POSTAL_MARIADB_PASSWORD: "PostalMariaDbStrongPass123!",
        POSTAL_RAILS_SECRET_KEY: "strong-postal-rails-secret",
        POSTAL_SIGNING_KEY_BASE64:
          "LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQpzdHJvbmcKLS0tLS1FTkQgUlNBIFBSSVZBVEUgS0VZLS0tLS0=",
        POSTAL_FNAME: "Postal",
        POSTAL_LNAME: "Operator",
        POSTAL_EMAIL: "postal.operator@local.test",
      },
    });

    expect(managedValues.nextValues.POSTGRES_URL).toBe(
      "postgresql://comvestec:StrongLocalPass123!@localhost:6543/comvestec",
    );
    expect(managedValues.nextValues.POSTGRES_URL_INTERNAL).toBe(
      "postgresql://comvestec:StrongLocalPass123!@postgres:5432/comvestec",
    );
  });

  it("generates Novu and Postal operator bootstrap credentials", () => {
    const managedValues = buildBootstrapManagedValues({
      state: {},
    });

    expect(managedValues.glitchtipOperatorEmail).toBe(
      "glitchtip.operator@example.com",
    );
    expect(managedValues.novuEmail).toBe("novu.operator@local.test");
    expect(managedValues.openpanelOperatorEmail).toBe(
      "openpanel.operator@local.test",
    );
    expect(managedValues.postalEmail).toBe("postal.operator@local.test");
    expect(managedValues.unleashOperatorUsername).toBe(
      "unleash.operator.local",
    );
    expect(managedValues.unleashOperatorEmail).toBe(
      "unleash.operator@example.com",
    );
    expect(managedValues.nextValues.NOVU_ORGANIZATION_NAME).toBe(
      "Comvestec Local",
    );
    expect(managedValues.nextValues.GLITCHTIP_OPERATOR_PASSWORD).toBeDefined();
    expect(managedValues.nextValues.NOVU_PASSWORD).toBeDefined();
    expect(managedValues.nextValues.OPENPANEL_OPERATOR_PASSWORD).toBeDefined();
    expect(managedValues.nextValues.POSTAL_PASSWORD).toBeDefined();
    expect(managedValues.nextValues.UNLEASH_OPERATOR_PASSWORD).toBeDefined();
    expect(
      isPlaceholderValue(
        managedValues.nextValues.GLITCHTIP_OPERATOR_PASSWORD ?? "",
      ),
    ).toBe(false);
    expect(
      isPlaceholderValue(managedValues.nextValues.NOVU_PASSWORD ?? ""),
    ).toBe(false);
    expect(managedValues.nextValues.NOVU_PASSWORD).toMatch(novuPasswordPattern);
    expect(
      isPlaceholderValue(
        managedValues.nextValues.OPENPANEL_OPERATOR_PASSWORD ?? "",
      ),
    ).toBe(false);
    expect(
      isPlaceholderValue(managedValues.nextValues.POSTAL_PASSWORD ?? ""),
    ).toBe(false);
    expect(
      isPlaceholderValue(
        managedValues.nextValues.UNLEASH_OPERATOR_PASSWORD ?? "",
      ),
    ).toBe(false);
  });

  it("rotates a stored Novu password when it fails the service complexity policy", () => {
    const managedValues = buildBootstrapManagedValues({
      state: {
        NOVU_PASSWORD: "StrongBut_Invalid1_",
      },
    });

    expect(managedValues.nextValues.NOVU_PASSWORD).not.toBe(
      "StrongBut_Invalid1_",
    );
    expect(managedValues.nextValues.NOVU_PASSWORD).toMatch(novuPasswordPattern);
  });

  it("keeps the Unleash runtime key aligned with the bootstrap token", () => {
    const managedValues = buildBootstrapManagedValues({
      state: {
        UNLEASH_API_KEY: "default:development.stale-unleash-runtime-token",
        UNLEASH_API_TOKEN: "default:development.current-unleash-backend-token",
      },
    });

    expect(managedValues.nextValues.UNLEASH_API_KEY).toBe(
      "default:development.current-unleash-backend-token",
    );
    expect(managedValues.nextValues.UNLEASH_API_TOKEN).toBe(
      "default:development.current-unleash-backend-token",
    );
  });

  it("uses the configured vault address ahead of a stale shell override", async () => {
    const tempDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-runtime-vault-address-"),
    );
    const envFilePath = join(tempDirectoryPath, "runtime.env");
    const originalVaultToken = process.env.VAULT_TOKEN;
    const originalFetch = global.fetch;

    try {
      writeFileSync(envFilePath, "VAULT_ADDR=http://configured-vault:8200\n");
      process.env.VAULT_TOKEN = "local-test-token";

      const fetchSpy = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                data: {},
              },
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
      );

      global.fetch = fetchSpy as typeof fetch;

      await resolveLocalRuntimeEnvironment({
        envFile: envFilePath,
        shellValues: {
          VAULT_ADDR: "http://stale-shell-vault:9999",
        },
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://configured-vault:8200/v1/platform/data/local-ops/runtime-env",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Vault-Token": "local-test-token",
          }),
        }),
      );
    } finally {
      global.fetch = originalFetch;

      if (originalVaultToken === undefined) {
        delete process.env.VAULT_TOKEN;
      } else {
        process.env.VAULT_TOKEN = originalVaultToken;
      }

      rmSync(tempDirectoryPath, {
        force: true,
        recursive: true,
      });
    }
  });

  it("re-derives the host postgres url from the current postgres port after reading Vault", async () => {
    const tempDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-runtime-postgres-port-"),
    );
    const envFilePath = join(tempDirectoryPath, "runtime.env");
    const originalVaultToken = process.env.VAULT_TOKEN;
    const originalFetch = global.fetch;

    try {
      writeFileSync(
        envFilePath,
        "VAULT_ADDR=http://configured-vault:8200\nPOSTGRES_PORT=6543\n",
      );
      process.env.VAULT_TOKEN = "local-test-token";

      const fetchSpy = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                data: {
                  POSTGRES_DB: "comvestec",
                  POSTGRES_USER: "comvestec",
                  POSTGRES_PASSWORD: "StrongLocalPass123!",
                  POSTGRES_URL:
                    "postgresql://comvestec:StrongLocalPass123!@localhost:5432/comvestec",
                },
              },
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
      );

      global.fetch = fetchSpy as typeof fetch;

      const resolution = await resolveLocalRuntimeEnvironment({
        envFile: envFilePath,
      });

      expect(resolution.values.POSTGRES_URL).toBe(
        "postgresql://comvestec:StrongLocalPass123!@localhost:6543/comvestec",
      );
    } finally {
      global.fetch = originalFetch;

      if (originalVaultToken === undefined) {
        delete process.env.VAULT_TOKEN;
      } else {
        process.env.VAULT_TOKEN = originalVaultToken;
      }

      rmSync(tempDirectoryPath, {
        force: true,
        recursive: true,
      });
    }
  });
});
