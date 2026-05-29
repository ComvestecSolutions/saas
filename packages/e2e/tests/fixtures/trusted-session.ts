import { test as base, expect, type Page } from "@playwright/test";
import {
  resolveAdminTrustedSession,
  type AdminTrustedSession,
} from "../../admin-e2e-environment";

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
export const adminTest = base.extend<{
  readonly trustedSession: AdminTrustedSession;
  readonly signedInPage: Page;
}>({
  trustedSession: async ({}, use, testInfo) => {
    const trustedSession = resolveAdminTrustedSession(process.env);

    if (trustedSession === undefined) {
      testInfo.skip(
        true,
        "ADMIN_E2E_* environment values are not configured; placeholder values from .env.example count as unset until a local wrapper or real target injects either a trusted session cookie or real operator credentials.",
      );
      return;
    }

    await use(trustedSession);
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
