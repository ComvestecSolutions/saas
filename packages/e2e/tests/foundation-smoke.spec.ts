import { expect, test } from "@playwright/test";

test("operations home requires an operator session", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByText("Operator session required", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Sign in with a platform-operator or support-operator session to access the admin operations workspace.",
    ),
  ).toBeVisible();
});

test("mobile navigation drawer opens from the admin shell", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "Open navigation" }).click();

  await expect(
    page.getByRole("dialog", { name: "Navigation drawer" }),
  ).toBeVisible();
  await expect(page.getByText("Repair Operations")).toBeVisible();
});

test("tenant workspace selector routes to a tenant path", async ({ page }) => {
  await page.goto("/tenants");

  await page.getByLabel("Tenant scope ID").fill("org_demo");
  await page.getByRole("button", { name: "Open workspace" }).click();

  await expect(page).toHaveURL(/\/tenants\/org_demo$/);
  await expect(
    page.getByText("Operator session required", { exact: true }),
  ).toBeVisible();
});
