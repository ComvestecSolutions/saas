import { adminTest as test, expect } from "./fixtures/trusted-session";

/**
 * Admin operator journey (admin-app spec §11 Phase 8 commit 8b).
 *
 * End-to-end coverage of the Operator Desk smoke path:
 *
 *   1. sign-in via the trusted-session cookie fixture (no manual
 *      bearer token paste — spec guardrail §14.9)
 *   2. land on `/desk` and confirm the shell renders
 *   3. pin a tenant via the omnibar / EdgeRail (spec §8.4)
 *   4. open `/desk/audit` and reveal a regulated-sensitive field
 *      through `RevealField` (spec §8.8 + governance pattern)
 *   5. open `/admin/members` and exercise the invite confirm flow
 *      through `HighRiskActionGuard` (spec §8.18)
 *   6. open `/admin/tokens`, issue a token, then revoke it
 *      (spec §8.18, ADR-024 admin-operator-test-tokens)
 *
 * The journey is hosted under the env-bound trusted-session fixture.
 * When the env values are absent (`.env.example`) the fixture skips
 * the whole test instead of synthesizing a local credential. This
 * keeps the CI gate honest about whether a real platform target was
 * available without ever inventing one in code.
 */

const SHELL_LABEL = "Operator Desk";

test.describe("admin operator journey", () => {
  test.setTimeout(300_000);

  test("sign-in → pin tenant → reveal audit field → invite member → issue + revoke token", async ({
    signedInPage: page,
    trustedSession,
  }) => {
    await test.step("desk shell mounts under the trusted session", async () => {
      await page.goto(`${trustedSession.baseURL}/desk`, {
        waitUntil: "domcontentloaded",
      });
      await expect(
        page.getByRole("application", { name: SHELL_LABEL }),
      ).toBeVisible();
      await page.waitForFunction(
        () => document.documentElement.dataset.adminShellHydrated === "true",
      );
    });

    await test.step("pin tenant via omnibar prefix grammar", async () => {
      const omnibar = page.getByRole("combobox", {
        name: /operator omnibar/i,
      });
      await omnibar.pressSequentially(`t/${trustedSession.tenantId}`);
      await omnibar.press("Enter");
      await expect(page).toHaveURL(
        new RegExp(`/desk/tenant/${trustedSession.tenantId}`),
      );
    });

    await test.step("open /desk/audit and reveal a regulated-sensitive field", async () => {
      await page.goto(
        `${trustedSession.baseURL}/desk/audit?module=support-operations`,
        {
          waitUntil: "domcontentloaded",
        },
      );
      await page.waitForFunction(
        () => document.documentElement.dataset.adminAuditLogHydrated === "true",
      );
      await page.getByTestId("audit-log-v2-row-toggle").first().click();
      await expect(
        page.getByTestId("audit-log-v2-row-detail").first(),
      ).toBeVisible();
      await page.getByTestId("reveal-field-trigger").first().click();
      await page
        .getByTestId("reveal-field-reason")
        .fill("e2e:operator-journey:reveal");
      await page.getByTestId("reveal-field-confirm").click();
      await expect(
        page.getByTestId("reveal-field-value").first(),
      ).toBeVisible();
    });

    await test.step("invite a member via /admin/members", async () => {
      await page.goto(`${trustedSession.baseURL}/admin/members`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForFunction(
        () => document.documentElement.dataset.adminMembersHydrated === "true",
      );
      const inviteEmailInput = page.getByTestId("admin-members-invite-email");
      await inviteEmailInput.click();
      await inviteEmailInput.pressSequentially(trustedSession.inviteEmail);
      await page.getByTestId("admin-members-invite-cta").click();
      await page.getByLabel(/role coverage — invite admin member/i).click();
      await page
        .getByTestId("high-risk-note")
        .fill("e2e:operator-journey:invite");
      await page.getByTestId("high-risk-arm").click();
      await page.getByTestId("high-risk-confirm-final").click();
      await expect(
        page.getByTestId("admin-members-action-success"),
      ).toContainText(trustedSession.inviteEmail);
      await expect(page.getByTestId("reveal-field-value")).toBeVisible();
    });

    await test.step("issue then revoke an admin-operator-test-token", async () => {
      await page.goto(`${trustedSession.baseURL}/admin/tokens`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForFunction(
        () => document.documentElement.dataset.adminTokensHydrated === "true",
      );
      const tokenLabelInput = page.getByTestId("admin-tokens-issue-label");
      await tokenLabelInput.click();
      await tokenLabelInput.pressSequentially(trustedSession.tokenLabel);
      await page.getByTestId("admin-tokens-issue-cta").click();
      const issueGuard = page.getByRole("dialog", {
        name: /high-risk: issue admin operator test token/i,
      });
      await expect(issueGuard).toBeVisible();
      await issueGuard
        .locator("[data-testid='high-risk-body'] input[type='radio']")
        .first()
        .check();
      await issueGuard
        .getByTestId("high-risk-note")
        .fill("e2e:operator-journey:issue");
      await issueGuard.getByTestId("high-risk-arm").click();
      await issueGuard.getByTestId("high-risk-confirm-final").click();

      await expect(
        page.getByTestId("admin-tokens-action-success"),
      ).toContainText(trustedSession.tokenLabel);
      await expect(page.getByTestId("reveal-field-value")).toBeVisible();
      const issuedTokenDialog = page.getByTestId(
        "admin-tokens-plaintext-dialog",
      );
      await expect(issuedTokenDialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(issuedTokenDialog).toBeHidden();

      const row = page
        .getByTestId("admin-tokens-row")
        .filter({ hasText: trustedSession.tokenLabel })
        .first();
      await expect(row).toBeVisible();

      await row.getByTestId("admin-tokens-revoke-cta").click();
      const revokeGuard = page.getByRole("dialog", {
        name: /high-risk: revoke admin operator test token/i,
      });
      await expect(revokeGuard).toBeVisible();
      await revokeGuard
        .locator("[data-testid='high-risk-body'] input[type='radio']")
        .first()
        .check();
      await revokeGuard
        .getByTestId("high-risk-note")
        .fill("e2e:operator-journey:revoke");
      await revokeGuard.getByTestId("high-risk-arm").click();
      await revokeGuard.getByTestId("high-risk-confirm-final").click();

      await expect(row).toContainText(/revoked/i);
    });
  });
});
