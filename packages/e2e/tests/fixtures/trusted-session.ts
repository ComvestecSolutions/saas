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
 *   - ADMIN_E2E_TRUSTED_SESSION_COOKIE_NAME    — cookie name carrying the trusted session id
 *   - ADMIN_E2E_TRUSTED_SESSION_COOKIE_VALUE   — pre-issued session id for the platform-operator
 *   - ADMIN_E2E_TENANT_ID                      — tenant to pin during the journey
 *   - ADMIN_E2E_INVITE_EMAIL                   — admin-organization invite target
 *   - ADMIN_E2E_TOKEN_LABEL                    — admin-operator-test-token issuance label
 *
 * These keys live in `.env.example`. Operators run the suite under
 * `bun run test:e2e` after the corresponding values are populated.
 */
export type AdminTrustedSession = {
  readonly baseURL: string;
  readonly tenantId: string;
  readonly inviteEmail: string;
  readonly tokenLabel: string;
  readonly cookieName: string;
  readonly cookieValue: string;
};

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
    const tenantId = requiredString("ADMIN_E2E_TENANT_ID");
    const inviteEmail = requiredString("ADMIN_E2E_INVITE_EMAIL");
    const tokenLabel = requiredString("ADMIN_E2E_TOKEN_LABEL");
    if (
      baseURL === undefined ||
      cookieName === undefined ||
      cookieValue === undefined ||
      tenantId === undefined ||
      inviteEmail === undefined ||
      tokenLabel === undefined
    ) {
      testInfo.skip(
        true,
        "ADMIN_E2E_* environment values are not configured; populate the entries in .env.example before running this suite.",
      );
      return;
    }
    await use({
      baseURL,
      tenantId,
      inviteEmail,
      tokenLabel,
      cookieName,
      cookieValue,
    });
  },
  signedInPage: async ({ context, page, trustedSession }, use) => {
    const url = new URL(trustedSession.baseURL);
    await context.addCookies([
      {
        name: trustedSession.cookieName,
        value: trustedSession.cookieValue,
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        secure: url.protocol === "https:",
        sameSite: "Lax",
      },
    ]);
    await page.goto(trustedSession.baseURL);
    await use(page);
  },
});

export { expect };
