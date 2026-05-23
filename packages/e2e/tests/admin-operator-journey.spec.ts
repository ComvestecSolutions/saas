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
 *   4. open `/r/audit` and reveal a regulated-sensitive field
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
  test("sign-in → pin tenant → reveal audit field → invite member → issue + revoke token", async ({
    signedInPage: page,
    trustedSession,
  }) => {
    await test.step("desk shell mounts under the trusted session", async () => {
      await page.goto(`${trustedSession.baseURL}/desk`);
      await expect(
        page.getByRole("application", { name: SHELL_LABEL }),
      ).toBeVisible();
    });

    await test.step("pin tenant via omnibar prefix grammar", async () => {
      const omnibar = page.getByRole("combobox", {
        name: /search|omnibar/i,
      });
      await omnibar.fill(`t/${trustedSession.tenantId}`);
      await omnibar.press("Enter");
      await expect(page).toHaveURL(
        new RegExp(`/r/tenant/${trustedSession.tenantId}`),
      );
    });

    await test.step("open /r/audit and reveal a regulated-sensitive field", async () => {
      await page.goto(`${trustedSession.baseURL}/r/audit`);
      const revealButton = page
        .getByRole("button", { name: /reveal/i })
        .first();
      await revealButton.click();
      const reasonInput = page.getByLabel(/reason/i);
      await reasonInput.fill("e2e:operator-journey:reveal");
      await page.getByRole("button", { name: /confirm/i }).click();
      await expect(
        page.getByRole("group", { name: /revealed/i }).first(),
      ).toBeVisible();
    });

    await test.step("invite a member via /admin/members", async () => {
      await page.goto(`${trustedSession.baseURL}/admin/members`);
      await page.getByRole("button", { name: /invite/i }).click();
      await page.getByLabel(/email/i).fill(trustedSession.inviteEmail);
      await page.getByLabel(/reason/i).fill("e2e:operator-journey:invite");
      await page.getByRole("button", { name: /confirm/i }).click();
      await expect(
        page.getByText(trustedSession.inviteEmail, { exact: false }),
      ).toBeVisible();
    });

    await test.step("issue then revoke an admin-operator-test-token", async () => {
      await page.goto(`${trustedSession.baseURL}/admin/tokens`);
      await page.getByRole("button", { name: /^issue/i }).click();
      await page.getByLabel(/label/i).fill(trustedSession.tokenLabel);
      await page.getByLabel(/reason/i).fill("e2e:operator-journey:issue");
      await page.getByRole("button", { name: /confirm/i }).click();

      const row = page.getByRole("row", {
        name: new RegExp(trustedSession.tokenLabel),
      });
      await expect(row).toBeVisible();

      await row.getByRole("button", { name: /revoke/i }).click();
      await page.getByLabel(/reason/i).fill("e2e:operator-journey:revoke");
      await page.getByRole("button", { name: /confirm/i }).click();

      await expect(row).toContainText(/revoked/i);
    });
  });
});
