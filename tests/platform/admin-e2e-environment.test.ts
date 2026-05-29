import { describe, expect, it } from "vitest";
import {
  defaultLocalAdminE2EBaseUrl,
  isPlaceholderValue,
  resolveAdminE2EBaseUrl,
  resolveAdminTrustedSession,
} from "../../packages/e2e/admin-e2e-environment";

const buildEnvironment = (
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> => ({
  ADMIN_E2E_BASE_URL: undefined,
  ADMIN_E2E_TRUSTED_SESSION_COOKIE_NAME: undefined,
  ADMIN_E2E_TRUSTED_SESSION_COOKIE_VALUE: undefined,
  ADMIN_E2E_OPERATOR_USERNAME: undefined,
  ADMIN_E2E_OPERATOR_PASSWORD: undefined,
  ADMIN_E2E_TENANT_ID: undefined,
  ADMIN_E2E_INVITE_EMAIL: undefined,
  ADMIN_E2E_TOKEN_LABEL: undefined,
  ...overrides,
});

describe("admin e2e environment helpers", () => {
  it("treats local-runtime placeholder values as unset", () => {
    expect(isPlaceholderValue("set-in-local-env__admin_e2e_base_url")).toBe(
      true,
    );
    expect(isPlaceholderValue("generate-after-bootstrap")).toBe(true);
    expect(isPlaceholderValue("")).toBe(true);
    expect(isPlaceholderValue(undefined)).toBe(true);
    expect(isPlaceholderValue("http://127.0.0.1:3004")).toBe(false);
  });

  it("falls back to the local admin origin when the base URL is a placeholder", () => {
    expect(
      resolveAdminE2EBaseUrl(
        buildEnvironment({
          ADMIN_E2E_BASE_URL: "set-in-local-env__admin_e2e_base_url",
        }),
      ),
    ).toBe(defaultLocalAdminE2EBaseUrl);
  });

  it("resolves operator auth when only real operator credentials are configured", () => {
    expect(
      resolveAdminTrustedSession(
        buildEnvironment({
          ADMIN_E2E_BASE_URL: "http://127.0.0.1:3004",
          ADMIN_E2E_TRUSTED_SESSION_COOKIE_NAME:
            "set-in-local-env__admin_e2e_cookie_name",
          ADMIN_E2E_TRUSTED_SESSION_COOKIE_VALUE:
            "set-in-local-env__admin_e2e_cookie_value",
          ADMIN_E2E_OPERATOR_USERNAME: "admin.e2e@local.test",
          ADMIN_E2E_OPERATOR_PASSWORD: "AdminE2E!Local2026",
          ADMIN_E2E_TENANT_ID: "org_smoke",
          ADMIN_E2E_INVITE_EMAIL: "admin.invite@local.test",
          ADMIN_E2E_TOKEN_LABEL: "admin-token-local",
        }),
      ),
    ).toEqual({
      authMode: "operator",
      baseURL: "http://127.0.0.1:3004",
      operatorUsername: "admin.e2e@local.test",
      operatorPassword: "AdminE2E!Local2026",
      tenantId: "org_smoke",
      inviteEmail: "admin.invite@local.test",
      tokenLabel: "admin-token-local",
    });
  });

  it("resolves trusted-cookie auth when only real cookie values are configured", () => {
    expect(
      resolveAdminTrustedSession(
        buildEnvironment({
          ADMIN_E2E_BASE_URL: "http://127.0.0.1:3004",
          ADMIN_E2E_TRUSTED_SESSION_COOKIE_NAME: "comvestec_session",
          ADMIN_E2E_TRUSTED_SESSION_COOKIE_VALUE: "sess_local_admin_e2e",
          ADMIN_E2E_OPERATOR_USERNAME:
            "set-in-local-env__admin_e2e_operator_username",
          ADMIN_E2E_OPERATOR_PASSWORD:
            "set-in-local-env__admin_e2e_operator_password",
          ADMIN_E2E_TENANT_ID: "org_smoke",
          ADMIN_E2E_INVITE_EMAIL: "admin.invite@local.test",
          ADMIN_E2E_TOKEN_LABEL: "admin-token-local",
        }),
      ),
    ).toEqual({
      authMode: "cookie",
      baseURL: "http://127.0.0.1:3004",
      cookieName: "comvestec_session",
      cookieValue: "sess_local_admin_e2e",
      tenantId: "org_smoke",
      inviteEmail: "admin.invite@local.test",
      tokenLabel: "admin-token-local",
    });
  });

  it("throws when both auth modes are configured with real values", () => {
    expect(() =>
      resolveAdminTrustedSession(
        buildEnvironment({
          ADMIN_E2E_BASE_URL: "http://127.0.0.1:3004",
          ADMIN_E2E_TRUSTED_SESSION_COOKIE_NAME: "comvestec_session",
          ADMIN_E2E_TRUSTED_SESSION_COOKIE_VALUE: "sess_local_admin_e2e",
          ADMIN_E2E_OPERATOR_USERNAME: "admin.e2e@local.test",
          ADMIN_E2E_OPERATOR_PASSWORD: "AdminE2E!Local2026",
          ADMIN_E2E_TENANT_ID: "org_smoke",
          ADMIN_E2E_INVITE_EMAIL: "admin.invite@local.test",
          ADMIN_E2E_TOKEN_LABEL: "admin-token-local",
        }),
      ),
    ).toThrow(
      "Configure exactly one ADMIN_E2E auth mode: either trusted session cookie values or operator credentials, not both.",
    );
  });
});
