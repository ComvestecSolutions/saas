import { test as base, expect, type Page } from "@playwright/test";

/**
 * Trusted-session fixture for the admin-operator-journey suite.
 *
 * The fixture installs the platform-provided trusted operator session
 * cookie into the Playwright context before any test step. Every input
 * is env-bound (`.env.example` is the canonical source of truth);
 * fixtures NEVER synthesize localhost URLs, credentials, or session
 * tokens — when an env value is missing the test is skipped at the
 * fixture level so the suite never silently substitutes a credential.
 *
 * Bindings (all required when running the suite end-to-end):
 *   - ADMIN_E2E_BASE_URL                       — admin-app origin
 *   - ADMIN_E2E_TENANT_ID                      — tenant to pin during the journey
 *   - ADMIN_E2E_INVITE_EMAIL                   — admin-organization invite target
 *   - ADMIN_E2E_TOKEN_LABEL                    — admin-operator-test-token issuance label
 *
 * Provide exactly one auth mode:
 *   - Trusted cookie mode
 *     - ADMIN_E2E_TRUSTED_SESSION_COOKIE_NAME  — cookie name carrying the trusted session id
 *     - ADMIN_E2E_TRUSTED_SESSION_COOKIE_VALUE — pre-issued session id for the platform-operator
 *   - Real operator sign-in mode
 *     - ADMIN_E2E_OPERATOR_USERNAME            — real operator username/email for Keycloak sign-in
 *     - ADMIN_E2E_OPERATOR_PASSWORD            — real operator password for Keycloak sign-in
 *
 * These keys live in `.env.example`. Operators run the suite under
 * `bun run test:e2e` after the corresponding values are populated.
 */
export type AdminTrustedSession = {
  readonly baseURL: string;
  readonly tenantId: string;
  readonly inviteEmail: string;
  readonly tokenLabel: string;
} & (
  | {
      readonly authMode: "cookie";
      readonly cookieName: string;
      readonly cookieValue: string;
    }
  | {
      readonly authMode: "operator";
      readonly operatorUsername: string;
      readonly operatorPassword: string;
    }
);

const requiredString = (key: string): string | undefined => {
  const value = process.env[key];
  if (value === undefined) return undefined;
  if (value.length === 0) return undefined;
  return value;
};

export const adminTest = base.extend<{
  readonly trustedSession: AdminTrustedSession;
  readonly signedInPage: Page;
}>({
  trustedSession: async ({}, use, testInfo) => {
    const baseURL = requiredString("ADMIN_E2E_BASE_URL");
    const cookieName = requiredString("ADMIN_E2E_TRUSTED_SESSION_COOKIE_NAME");
    const cookieValue = requiredString(
      "ADMIN_E2E_TRUSTED_SESSION_COOKIE_VALUE",
    );
    const operatorUsername = requiredString("ADMIN_E2E_OPERATOR_USERNAME");
    const operatorPassword = requiredString("ADMIN_E2E_OPERATOR_PASSWORD");
    const tenantId = requiredString("ADMIN_E2E_TENANT_ID");
    const inviteEmail = requiredString("ADMIN_E2E_INVITE_EMAIL");
    const tokenLabel = requiredString("ADMIN_E2E_TOKEN_LABEL");
    const hasTrustedCookie =
      cookieName !== undefined && cookieValue !== undefined;
    const hasOperatorCredentials =
      operatorUsername !== undefined && operatorPassword !== undefined;
    if (hasTrustedCookie && hasOperatorCredentials) {
      throw new TypeError(
        "Configure exactly one ADMIN_E2E auth mode: either trusted session cookie values or operator credentials, not both.",
      );
    }
    if (
      baseURL === undefined ||
      tenantId === undefined ||
      inviteEmail === undefined ||
      tokenLabel === undefined ||
      (!hasTrustedCookie && !hasOperatorCredentials)
    ) {
      testInfo.skip(
        true,
        "ADMIN_E2E_* environment values are not configured; populate the entries in .env.example with either a trusted session cookie or real operator credentials before running this suite.",
      );
      return;
    }
    if (hasOperatorCredentials) {
      await use({
        authMode: "operator",
        baseURL,
        tenantId,
        inviteEmail,
        tokenLabel,
        operatorUsername,
        operatorPassword,
      });
      return;
    }
    if (!hasTrustedCookie) {
      throw new TypeError(
        "Trusted session cookie values must be present when operator credentials are absent.",
      );
    }

    await use({
      authMode: "cookie",
      baseURL,
      tenantId,
      inviteEmail,
      tokenLabel,
      cookieName,
      cookieValue,
    });
  },
  signedInPage: async ({ context, page, trustedSession }, use) => {
    if (trustedSession.authMode === "cookie") {
      const url = new URL(trustedSession.baseURL);
      await context.addCookies([
        {
          name: trustedSession.cookieName,
          value: trustedSession.cookieValue,
          url: trustedSession.baseURL,
          httpOnly: true,
          secure: url.protocol === "https:",
          sameSite: "Lax",
        },
      ]);
      await use(page);
      return;
    }

    await page.goto(
      new URL(
        "/auth/start?returnTo=%2Fdesk",
        trustedSession.baseURL,
      ).toString(),
      {
        waitUntil: "domcontentloaded",
      },
    );
    await page
      .locator('input[name="username"]')
      .fill(trustedSession.operatorUsername);
    await page
      .locator('input[name="password"]')
      .fill(trustedSession.operatorPassword);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/desk$/, {
      timeout: 60_000,
    });
    await use(page);
  },
});

export { expect };
