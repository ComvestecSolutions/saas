import { afterEach, describe, expect, it } from "vitest";
import { adminRoutePath, workflowJobStatus } from "@comvestec/contracts";
import {
  changeInputValue,
  changeSelectValue,
  click,
  followLink,
  getButtonByExactText,
  getButtonByText,
  getColumnValues,
  getFieldControlByLabel,
  getFirstColumnValues,
  getInputByPlaceholder,
  getLinkByText,
  pushPath,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "./admin-browser-harness";
import {
  type AdminBrowserFixtureState,
  createAdminBrowserFixtureState,
  knownAdminTargets,
} from "./admin-browser-fixtures";

const sortTextAscending = (values: ReadonlyArray<string>) =>
  [...values].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );

const sortTextDescending = (values: ReadonlyArray<string>) =>
  sortTextAscending(values).reverse();

const legacyAdminRoutePath = {
  branding: "/branding",
  supportOperations: "/support-operations",
  billing: "/billing",
  complianceRetention: "/compliance-retention",
  webhooksApiAccess: "/integrations/webhooks-api-access",
} as const;

const getSortHeader = (container: ParentNode, label: string) => {
  const button = getButtonByText(container, label);
  const header = button.closest("th");

  if (!(header instanceof HTMLTableCellElement)) {
    throw new TypeError(`Expected ${label} sort header to render.`);
  }

  return { button, header };
};

const getCardByTitle = (container: ParentNode, title: string) => {
  const card = [...container.querySelectorAll(".ops-card")].find((candidate) =>
    candidate.textContent?.includes(title),
  );

  if (!(card instanceof HTMLElement)) {
    throw new TypeError(`Expected ${title} card to render.`);
  }

  return card;
};

const selectTenantTargetOption = async (
  container: ParentNode,
  label: string,
) => {
  await waitFor(
    () => container.textContent?.includes(label) ?? false,
    `Expected tenant target option ${label} to render.`,
  );
  await click(getButtonByText(container, label));
};

const operationsHomeCapabilityRoutes = [
  {
    label: "Operations Home",
    href: adminRoutePath.operationsHome,
  },
  {
    label: "Tenant Workspace",
    href: adminRoutePath.tenantWorkspaceDiscovery,
  },
  {
    label: "Audit Log",
    href: adminRoutePath.auditLog,
  },
  {
    label: "Billing",
    href: adminRoutePath.billing,
  },
  {
    label: "Runtime Config",
    href: adminRoutePath.runtimeConfig,
  },
  {
    label: "Webhooks & API Access",
    href: adminRoutePath.webhooksApiAccess,
  },
] as const;

describe("admin operations browser flows", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders operations-home metrics, exposes capability cards, and navigates through shell links", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      adminRoutePath.operationsHome,
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Operations Home") ?? false,
      "Expected operations-home route to render.",
    );

    expect(rendered.container.textContent).toContain("Attention required");
    expect(rendered.container.textContent).toContain("Triage queue");
    expect(rendered.container.textContent).toContain("Vendor watch");
    expect(rendered.container.textContent).toContain("Active alerts");
    expect(rendered.container.textContent).toContain("Recent activity");
    expect(rendered.container.textContent).toContain("Pending approvals");
    expect(rendered.container.textContent).toContain("Vendor posture");
    expect(rendered.container.textContent).toContain("Break-glass incident");
    expect(rendered.container.textContent).toContain("novu");
    expect(rendered.container.textContent).toContain("postal");
    expect(
      rendered.container.querySelectorAll(".ops-alert").length,
    ).toBeGreaterThan(0);
    expect(
      rendered.container.querySelectorAll(".ops-activity-item").length,
    ).toBeGreaterThan(0);

    const capabilityLinks = [
      ...rendered.container.querySelectorAll("a.ops-card-row"),
    ].filter(
      (link): link is HTMLAnchorElement => link instanceof HTMLAnchorElement,
    );

    for (const { label, href } of operationsHomeCapabilityRoutes) {
      const link = capabilityLinks.find(
        (candidate) =>
          candidate.textContent?.includes(label) === true &&
          candidate.getAttribute("href") === href,
      );

      if (!(link instanceof HTMLAnchorElement)) {
        throw new TypeError(
          `Expected operations-home capability link for ${label}.`,
        );
      }

      expect(link.textContent).toContain(href);
    }

    const billingLink = capabilityLinks.find(
      (link) =>
        link.textContent?.includes("Billing") === true &&
        link.getAttribute("href") === adminRoutePath.billing,
    );

    if (!(billingLink instanceof HTMLAnchorElement)) {
      throw new TypeError(
        "Expected Billing capability link to render on operations home.",
      );
    }

    await followLink(rendered.router, billingLink);
    await waitFor(
      () => rendered?.container.textContent?.includes("Billing") ?? false,
      "Expected billing route to render from operations home.",
    );

    const openNavigationButton = rendered.container.querySelector(
      'button[aria-label="Open navigation"]',
    );

    if (!(openNavigationButton instanceof HTMLButtonElement)) {
      throw new TypeError(
        "Expected the mobile shell navigation toggle to render on billing.",
      );
    }

    await click(openNavigationButton);
    await followLink(
      rendered.router,
      getLinkByText(rendered.container, "Operations Home"),
    );
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Operations Home") ?? false,
      "Expected shell navigation to return to operations home.",
    );

    const tenantWorkspaceLink = [
      ...rendered.container.querySelectorAll("a.ops-card-row"),
    ].find(
      (link) =>
        link.textContent?.includes("Tenant Workspace") === true &&
        link.getAttribute("href") === adminRoutePath.tenantWorkspaceDiscovery,
    );

    if (!(tenantWorkspaceLink instanceof HTMLAnchorElement)) {
      throw new TypeError(
        "Expected Tenant Workspace capability link to point at discovery.",
      );
    }

    expect(tenantWorkspaceLink.textContent).toContain(
      adminRoutePath.tenantWorkspaceDiscovery,
    );

    await followLink(rendered.router, tenantWorkspaceLink);
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenants-directory-ready']",
        ) !== null,
      "Expected tenant workspace discovery link to render the canonical tenant directory surface.",
    );
  }, 30_000);

  it("opens the operator profile from the shell header and shows identity posture", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      adminRoutePath.operationsHome,
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Operations Home") ?? false,
      "Expected operations-home route to render before opening the profile.",
    );

    await followLink(
      rendered.router,
      getLinkByText(rendered.container, "My profile"),
    );
    await waitFor(
      () => rendered?.container.textContent?.includes("My profile") ?? false,
      "Expected the operator profile route to render from the shell header.",
    );

    expect(rendered.router.state.location.pathname).toBe(
      adminRoutePath.profile,
    );
    expect(rendered.container.textContent).toContain(
      "Comvestec Platform Operator",
    );
    expect(rendered.container.textContent).toContain("operator@comvestec.com");
    expect(rendered.container.textContent).toContain("platform-operator");
    expect(rendered.container.textContent).toContain("Capability workspace");
    expect(rendered.container.textContent).toContain("Allowed capabilities");
  });

  it("covers repair operations searching, inspection reveal, mutation actions, sorting, and pagination", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      adminRoutePath.repairOperations,
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Repair Operations") ?? false,
      "Expected repair-operations route to render.",
    );
    const repairContainer = rendered.container;

    const inspectionReason = getFieldControlByLabel<HTMLInputElement>(
      repairContainer,
      "Inspection reason",
      "input",
    );
    await changeInputValue(
      inspectionReason,
      "Customer escalation requires detailed repair errors.",
    );
    await click(getButtonByText(repairContainer, "Reveal details"));
    await waitFor(
      () =>
        repairContainer.textContent?.includes("Failure details visible") ??
        false,
      "Expected inspection reason to reveal repair details.",
    );

    const search = getInputByPlaceholder(
      repairContainer,
      "Search by tenant id, scope, or job id…",
    );
    await changeInputValue(search, "job_org_demo_01");
    await waitFor(
      () =>
        repairContainer.querySelectorAll("tbody tr").length === 1 &&
        (repairContainer.textContent?.includes("org_demo") ?? false),
      "Expected repair search to isolate the target workflow.",
    );

    expect(repairContainer.textContent).toContain(
      "Repair actions automatically inherit the signed-in operator identity",
    );
    await click(getButtonByText(repairContainer, "Replay"));
    await waitFor(
      () =>
        repairContainer.textContent?.includes(
          "Replayed repair gap for org_demo.",
        ) ?? false,
      "Expected repair replay success feedback to render without a manual workflow token.",
    );
    await waitFor(
      () => repairContainer.textContent?.includes("running") ?? false,
      "Expected replayed repair gap to refresh into the running state.",
    );

    await waitFor(
      () =>
        !getButtonByExactText(repairContainer, "Cancel").hasAttribute(
          "disabled",
        ),
      "Expected repair cancel action to be enabled after the replay refresh completes.",
    );
    await click(getButtonByExactText(repairContainer, "Cancel"));
    await waitFor(
      () =>
        repairContainer.textContent?.includes(
          "Cancelled repair gap for org_demo.",
        ) ?? false,
      "Expected repair cancel success feedback to render.",
    );
    await waitFor(
      () => repairContainer.textContent?.includes("canceled") ?? false,
      "Expected cancelled repair gap to refresh into the canceled state.",
    );

    await changeInputValue(search, "");
    await waitFor(
      () => repairContainer.querySelectorAll("tbody tr").length > 1,
      "Expected the full repair table to render after clearing the search.",
    );

    const { button: tenantHeaderButton, header: tenantHeader } = getSortHeader(
      repairContainer,
      "Tenant",
    );

    await click(tenantHeaderButton);
    expect(tenantHeader.getAttribute("aria-sort")).toBe("ascending");

    const tenantColumnValues = getFirstColumnValues(repairContainer);
    expect(tenantColumnValues).toEqual(sortTextAscending(tenantColumnValues));

    await click(tenantHeaderButton);
    expect(tenantHeader.getAttribute("aria-sort")).toBe("descending");

    const reversedTenantColumnValues = getFirstColumnValues(repairContainer);
    expect(reversedTenantColumnValues).toEqual(
      sortTextDescending(reversedTenantColumnValues),
    );

    await click(getButtonByExactText(repairContainer, "2"));
    await waitFor(
      () => repairContainer.textContent?.includes("26–32 of 32") ?? false,
      "Expected repair pagination to move to page two.",
    );
  });

  it("refreshes repair operations when the operator clicks the explicit reload action", async () => {
    const fixture = createAdminBrowserFixtureState();
    let repairLoadCount = 0;

    const refreshFixture: AdminBrowserFixtureState = {
      ...fixture,
      loadRepair: async (input) => {
        const result = await fixture.loadRepair(input);

        if (result.kind !== "ready") {
          return result;
        }

        repairLoadCount += 1;

        return {
          ...result,
          jobs: result.jobs.map((job) =>
            job.jobId === "job_org_demo_01"
              ? {
                  ...job,
                  status:
                    repairLoadCount > 1
                      ? workflowJobStatus.completed
                      : workflowJobStatus.blocked,
                  lastError: repairLoadCount > 1 ? undefined : job.lastError,
                }
              : job,
          ),
        };
      },
    };

    rendered = await renderAdminApp(
      refreshFixture,
      adminRoutePath.repairOperations,
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Repair Operations") ?? false,
      "Expected repair-operations route to render.",
    );

    const search = getInputByPlaceholder(
      rendered.container,
      "Search by tenant id, scope, or job id…",
    );
    await changeInputValue(search, "job_org_demo_01");
    await waitFor(
      () => rendered?.container.textContent?.includes("blocked") ?? false,
      "Expected the targeted repair gap to start in the blocked state.",
    );

    await click(getButtonByText(rendered.container, "Refresh"));
    await waitFor(
      () => rendered?.container.textContent?.includes("completed") ?? false,
      "Expected the repair refresh action to reload the latest job status.",
    );
    expect(repairLoadCount).toBeGreaterThan(1);
  });

  it("routes legacy support operations into the canonical support workspace and tenant detail navigation", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      legacyAdminRoutePath.supportOperations,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='support-cases-ready']",
        ) !== null,
      "Expected the canonical support workspace to render through the legacy support entrypoint.",
    );
    expect(rendered.router.state.location.pathname).toBe(
      adminRoutePath.supportOperations,
    );

    expect(
      rendered.container.querySelector("[data-testid='support-cases-posture']"),
    ).not.toBeNull();

    const caseSearch = getInputByPlaceholder(
      rendered.container,
      "Search case id, tenant, summary, or agent…",
    );
    await changeInputValue(caseSearch, "case_org_priority");
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("case_org_priority") ?? false,
      "Expected support-case search to isolate the target case.",
    );

    await click(getSortHeader(rendered.container, "Created").button);
    await click(getButtonByText(rendered.container, "Break-glass"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          'input[placeholder="Search incident id, reviewer, or reason…"]',
        ) !== null,
      "Expected break-glass support tab to render.",
    );

    const incidentSearch = getInputByPlaceholder(
      rendered.container,
      "Search incident id, reviewer, or reason…",
    );
    await changeInputValue(incidentSearch, "incident_case_01");
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("incident_case_01") ?? false,
      "Expected break-glass search to match the target incident.",
    );

    await click(getButtonByText(rendered.container, "Impersonation"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          'input[placeholder="Search impersonation sessions…"]',
        ) !== null,
      "Expected impersonation support tab to render.",
    );

    const impersonationSearch = getInputByPlaceholder(
      rendered.container,
      "Search impersonation sessions…",
    );
    await changeInputValue(impersonationSearch, "impersonation_case_01");
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("impersonation_case_01") ??
        false,
      "Expected impersonation search to match the target session.",
    );

    await click(getButtonByText(rendered.container, "Support cases"));
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("case_org_priority") ?? false,
      "Expected support cases tab to restore the prior filtered case.",
    );

    const workspaceLink = rendered.container.querySelector<HTMLAnchorElement>(
      "[data-testid='support-cases-case-row'] a[href^='/r/tenant/']",
    );
    if (!(workspaceLink instanceof HTMLAnchorElement)) {
      throw new TypeError(
        "Expected the support case action to expose a tenant workspace link.",
      );
    }

    await followLink(rendered.router, workspaceLink);
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Tenant overview") ?? false,
      "Expected tenant workspace v2 detail route to render from support operations.",
    );
  });

  it("routes legacy branding into the canonical target workflow and returns to the tenant workspace", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      legacyAdminRoutePath.branding,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='branding-list-ready']",
        ) !== null,
      "Expected the canonical branding workspace to render through the legacy branding entrypoint.",
    );
    expect(rendered.router.state.location.pathname).toBe(
      adminRoutePath.branding,
    );
    expect(
      rendered.container.querySelector("[data-testid='branding-list-empty']"),
    ).not.toBeNull();

    expect(rendered.container.textContent).toContain("Acme Co.");
    await selectTenantTargetOption(rendered.container, "Acme Co.");
    await click(getButtonByText(rendered.container, "Add branding target"));
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='branding-list-row']",
        ).length === 1,
      "Expected the canonical branding target workflow to load the selected tenant.",
    );
    expect(rendered.router.state.location.searchStr).toContain(
      `selectedTenantId=${knownAdminTargets.organization.scopeId}`,
    );

    await followLink(
      rendered.router,
      getLinkByText(rendered.container, "Open workspace"),
    );
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Tenant overview") ?? false,
      "Expected branding route workspace link to open the tenant workspace.",
    );
    expect(rendered.router.state.location.searchStr).toContain(
      `scope=${knownAdminTargets.organization.scope}`,
    );
  });

  it("covers tenant discovery filtering, manual workspace navigation, and canonical retention/webhook flows", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      adminRoutePath.tenantWorkspaceDiscovery,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenants-directory-ready']",
        ) !== null,
      "Expected tenant workspace discovery route to render the canonical tenant directory surface.",
    );

    const search = getInputByPlaceholder(
      rendered.container,
      "Search tenants, scopes, or ids…",
    );
    await changeInputValue(search, knownAdminTargets.organization.scopeId);
    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          knownAdminTargets.organization.scopeId,
        ) ?? false,
      "Expected tenant discovery search to reveal the organization target.",
    );

    await changeInputValue(search, "");
    await click(getButtonByText(rendered.container, "Blocked"));
    await waitFor(
      () => rendered?.container.textContent?.includes("Umbrella") ?? false,
      "Expected canonical tenant directory tabs to narrow the roster.",
    );

    await click(getButtonByText(rendered.container, "All"));
    await waitFor(
      () => rendered?.container.textContent?.includes("Acme Co.") ?? false,
      "Expected the full tenant roster to return after clearing the posture filter.",
    );

    await changeInputValue(search, knownAdminTargets.organization.scopeId);
    await waitFor(
      () => rendered?.container.textContent?.includes("Acme Co.") ?? false,
      "Expected the organization tenant to become the focused tenant again.",
    );
    const workspaceLink = getLinkByText(rendered.container, "Open workspace");
    await followLink(rendered.router, workspaceLink);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Tenant overview") ?? false,
      "Expected tenant target form submission to navigate into the workspace detail route.",
    );

    await pushPath(rendered.router, adminRoutePath.complianceRetention);
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Choose a tenant target") ??
        false,
      "Expected the canonical retention route to start in the tenant-target empty state.",
    );
    expect(rendered.router.state.location.pathname).toBe(
      adminRoutePath.complianceRetention,
    );

    await selectTenantTargetOption(rendered.container, "Acme Co.");
    await click(getButtonByText(rendered.container, "Load retention view"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='retention-list-policies-table']",
        ) !== null,
      "Expected the canonical retention route to load tenant-scoped policy data.",
    );

    const policySearch = getInputByPlaceholder(
      rendered.container,
      "Search policies…",
    );
    await changeInputValue(policySearch, "policy_org_28");
    await waitFor(
      () => rendered?.container.textContent?.includes("policy_org_28") ?? false,
      "Expected compliance policy search to narrow the table.",
    );
    await changeInputValue(policySearch, "");

    const { button: policyHeaderButton, header: policyHeader } = getSortHeader(
      rendered.container,
      "Policy ID",
    );

    await click(policyHeaderButton);
    expect(policyHeader.getAttribute("aria-sort")).toBe("ascending");
    const policyIds = getFirstColumnValues(rendered.container);
    expect(policyIds).toEqual(sortTextAscending(policyIds));

    await click(policyHeaderButton);
    expect(policyHeader.getAttribute("aria-sort")).toBe("descending");
    const descendingPolicyIds = getFirstColumnValues(rendered.container);
    expect(descendingPolicyIds).toEqual(
      sortTextDescending(descendingPolicyIds),
    );

    await click(getButtonByText(rendered.container, "Legal holds"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          'input[placeholder="Search holds, targets, or evidence…"]',
        ) !== null,
      "Expected legal-holds compliance tab to render.",
    );
    const holdSearch = getInputByPlaceholder(
      rendered.container,
      "Search holds, targets, or evidence…",
    );
    await changeInputValue(holdSearch, "");
    await click(getButtonByExactText(rendered.container, "2"));
    await waitFor(
      () => rendered?.container.textContent?.includes("26–26 of 26") ?? false,
      "Expected legal-hold pagination to move to page two.",
    );

    await pushPath(rendered.router, adminRoutePath.webhooksApiAccess);
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Choose a tenant target") ??
        false,
      "Expected the canonical webhook route to start in the tenant-target empty state.",
    );
    expect(rendered.router.state.location.pathname).toBe(
      adminRoutePath.webhooksApiAccess,
    );

    await selectTenantTargetOption(rendered.container, "Acme Co.");
    await click(getButtonByText(rendered.container, "Load webhook view"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='webhook-list-endpoints-table']",
        ) !== null,
      "Expected the canonical webhook route to load endpoint data for the selected tenant.",
    );

    const subscriptionSearch = getInputByPlaceholder(
      rendered.container,
      "Search subscriptions, URL, or event…",
    );
    await changeInputValue(subscriptionSearch, "sub_org_27");
    await waitFor(
      () => rendered?.container.textContent?.includes("sub_org_27") ?? false,
      "Expected subscription search to match the target webhook.",
    );

    await click(getButtonByText(rendered.container, "Deliveries"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          'input[placeholder="Search deliveries, subscription, or event…"]',
        ) !== null,
      "Expected the webhook deliveries tab to render.",
    );
    const deliverySearch = getInputByPlaceholder(
      rendered.container,
      "Search deliveries, subscription, or event…",
    );
    await changeInputValue(deliverySearch, "dlv_org_demo_03");
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("dlv_org_demo_03") ?? false,
      "Expected delivery search to reveal the selected webhook delivery.",
    );
  });

  it("routes legacy billing into billing operations and supports named target loading", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      legacyAdminRoutePath.billing,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='billing-list-ready']",
        ) !== null,
      "Expected the canonical billing workspace to render through the legacy billing entrypoint.",
    );
    expect(rendered.router.state.location.pathname).toBe(
      adminRoutePath.billing,
    );
    expect(
      rendered.container.querySelector("[data-testid='billing-list-empty']"),
    ).not.toBeNull();

    await selectTenantTargetOption(rendered.container, "Acme Co.");
    await click(getButtonByText(rendered.container, "Add billing target"));
    await waitFor(
      () =>
        rendered?.container.querySelectorAll("[data-testid='billing-list-row']")
          .length === 1,
      "Expected the canonical billing target workflow to load the selected tenant.",
    );
    expect(
      rendered.container.querySelectorAll(
        "[data-testid='billing-list-target-chip']",
      ),
    ).toHaveLength(1);
    expect(rendered.container.textContent).toContain("Acme Co.");
  });
});
