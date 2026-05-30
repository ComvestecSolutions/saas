import AxeBuilder from "@axe-core/playwright";
import { adminTest as test, expect } from "../tests/fixtures/trusted-session";
import { a11yIgnored } from "./a11y-allowlist";

/**
 * Axe-core a11y audit per primary route (admin-app spec §11 Phase
 * 8d + §10 layer 6).
 *
 * Standards: WCAG 2.1 AA. Serious + critical violations fail the
 * CI gate. Waived rules per route live in `a11y-allowlist.ts` and
 * MUST carry an inline justification.
 *
 * The audit reuses the trusted-session fixture; absent env values
 * skip the suite rather than synthesize local credentials.
 */
const a11yRoutes = [
  "/desk",
  "/desk/tenants",
  "/desk/audit",
  "/desk/config",
  "/desk/flag",
  "/desk/access",
  "/desk/billing",
  "/desk/branding",
  "/desk/retention",
  "/desk/webhook",
  "/desk/runs",
  "/desk/vendors",
  "/desk/notify",
  "/desk/support",
  "/admin/profile",
  "/admin/members",
  "/admin/workspaces",
  "/admin/tokens",
  "/admin/audit",
] as const;

const SEVERE_IMPACTS = new Set<string>(["serious", "critical"]);

for (const route of a11yRoutes) {
  test(`axe a11y audit: ${route}`, async ({
    signedInPage: page,
    trustedSession,
  }) => {
    await page.goto(`${trustedSession.baseURL}${route}`);

    const waivedRuleIds = new Set(
      a11yIgnored
        .filter((entry) => entry.route === route)
        .map((entry) => entry.ruleId),
    );

    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const severe = audit.violations.filter(
      (violation) =>
        SEVERE_IMPACTS.has(violation.impact ?? "") &&
        !waivedRuleIds.has(violation.id),
    );

    expect(
      severe,
      `Unwaived serious/critical a11y violations on ${route}: ${severe
        .map((violation) => `${violation.id} (${violation.impact})`)
        .join(", ")}`,
    ).toEqual([]);
  });
}
