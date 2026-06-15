import { test as base, expect, type Page } from "@playwright/test";
import {
  resolveAdminTrustedSession,
  type AdminTrustedSession,
} from "../../admin-e2e-environment";

const operatorUsernameInputSelector = 'input[name="username"]';
const operatorPasswordInputSelector = 'input[name="password"]';
const continueToSignInLinkName = /continue to sign in/i;
const operatorSignInRetryCount = 3;
const operatorDeskUrlPattern = /\/desk(?:\?.*)?$/;

const waitForOperatorCredentialsForm = (page: Page, timeout: number) =>
  page.locator(operatorUsernameInputSelector).waitFor({
    state: "visible",
    timeout,
  });

const resolveOperatorSignInRetryLink = (page: Page) =>
  page.getByRole("link", { name: continueToSignInLinkName });

const isRestartSignInUrl = (url: URL): boolean =>
  url.pathname === "/sign-in" &&
  url.searchParams.get("reason") === "restart-sign-in";

const waitForOperatorCredentialsFormWithRetries = async (page: Page) => {
  for (
    let retryAttempt = 0;
    retryAttempt < operatorSignInRetryCount;
    retryAttempt += 1
  ) {
    const formResult = await waitForOperatorCredentialsForm(page, 5_000).then(
      () => "ready" as const,
      () => "retry" as const,
    );

    if (formResult === "ready") {
      return;
    }

    const retryLink = resolveOperatorSignInRetryLink(page);
    const retryLinkVisible = await retryLink.isVisible().catch(() => false);

    if (!retryLinkVisible) {
      break;
    }

    await retryLink.click();
  }

  await expect(page.locator(operatorUsernameInputSelector)).toBeVisible({
    timeout: 60_000,
  });
};

const signInOperatorWithRetries = async (
  page: Page,
  trustedSession: Extract<AdminTrustedSession, { authMode: "operator" }>,
) => {
  const authStartUrl = new URL(
    "/auth/start?returnTo=%2Fdesk",
    trustedSession.baseURL,
  ).toString();

  for (
    let retryAttempt = 0;
    retryAttempt < operatorSignInRetryCount;
    retryAttempt += 1
  ) {
    await page.goto(authStartUrl, {
      waitUntil: "domcontentloaded",
    });
    await waitForOperatorCredentialsFormWithRetries(page);
    await page
      .locator(operatorUsernameInputSelector)
      .fill(trustedSession.operatorUsername);
    await page
      .locator(operatorPasswordInputSelector)
      .fill(trustedSession.operatorPassword);
    await Promise.all([
      page.waitForURL(
        (url) =>
          operatorDeskUrlPattern.test(`${url.pathname}${url.search}`) ||
          isRestartSignInUrl(url),
        {
          timeout: 60_000,
        },
      ),
      page.getByRole("button", { name: /sign in/i }).click(),
    ]);

    const currentUrl = new URL(page.url());
    if (
      operatorDeskUrlPattern.test(`${currentUrl.pathname}${currentUrl.search}`)
    ) {
      return;
    }

    if (!isRestartSignInUrl(currentUrl)) {
      break;
    }
  }

  throw new Error(
    "Operator sign-in did not reach /desk after the configured retry budget.",
  );
};

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

    await signInOperatorWithRetries(page, trustedSession);
    await expect(
      page.getByRole("application", { name: /operator desk/i }),
    ).toBeVisible({
      timeout: 60_000,
    });
    await page.waitForFunction(
      () => document.documentElement.dataset.adminShellHydrated === "true",
      undefined,
      {
        timeout: 60_000,
      },
    );
    await use(page);
  },
});

export { expect };
