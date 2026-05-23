import { afterEach, describe, expect, it } from "vitest";
import {
  actorType,
  adminRoutePath,
  authorizationNamespace,
  authorizationRelation,
  platformModuleId,
} from "@comvestec/contracts";
import {
  changeInputValue,
  changeSelectValue,
  click,
  followLink,
  getButtonByExactText,
  getButtonByText,
  getColumnValues,
  getFieldControlByLabel,
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
} from "./admin-browser-fixtures";

const sortTextAscending = (values: ReadonlyArray<string>) =>
  [...values].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );

const sortTextDescending = (values: ReadonlyArray<string>) =>
  sortTextAscending(values).reverse();

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

const createSupportOperatorAccessFixture = (): AdminBrowserFixtureState => {
  const fixture = createAdminBrowserFixtureState();

  return {
    ...fixture,
    loadShell: async (location) => {
      const result = await fixture.loadShell(location);

      return result.kind !== "ready"
        ? result
        : {
            ...result,
            profile: {
              ...result.profile,
              identity: {
                ...result.profile.identity,
                actorId: "usr_support_operator",
                username: "support@comvestec.com",
                email: "support@comvestec.com",
                displayName: "Comvestec Support Operator",
                actorType: actorType.supportOperator,
              },
            },
          };
    },
    loadAccessControl: async (input) => {
      const result = await fixture.loadAccessControl(input);

      return result.kind !== "ready"
        ? result
        : {
            ...result,
            operatorDirectory: {
              ...result.operatorDirectory,
              currentOperator: {
                ...result.operatorDirectory.currentOperator,
                identity: {
                  ...result.operatorDirectory.currentOperator.identity,
                  actorId: "usr_support_operator",
                  username: "support@comvestec.com",
                  email: "support@comvestec.com",
                  displayName: "Comvestec Support Operator",
                  actorType: actorType.supportOperator,
                },
              },
            },
          };
    },
  };
};

describe("admin governance browser flows", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("routes operations-home capability cards to runtime configuration", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      adminRoutePath.operationsHome,
    );

    await followLink(
      rendered.router,
      getLinkByText(rendered.container, "Runtime Config"),
    );
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Runtime Configuration") ??
        false,
      "Expected runtime configuration route to render.",
    );
  }, 30_000);

  it("covers runtime configuration searching, sorting, tabs, and pagination", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      "/governance/runtime-config" as const,
    );

    const overridesSearch = getInputByPlaceholder(
      rendered.container,
      "Search by module, key, scope, or value…",
    );
    await changeInputValue(overridesSearch, "timeout-29");
    await waitFor(
      () => rendered?.container.textContent?.includes("timeout-29") ?? false,
      "Expected runtime override search to narrow the table.",
    );
    expect(rendered.container.textContent).not.toContain("timeout-01");
    await changeInputValue(overridesSearch, "");
    await waitFor(
      () => (rendered?.container.querySelectorAll("tbody tr").length ?? 0) > 1,
      "Expected clearing the runtime override search to restore multiple runtime overrides.",
    );

    const { button: keyHeaderButton, header: keyHeader } = getSortHeader(
      rendered.container,
      "Key",
    );

    await click(keyHeaderButton);
    expect(keyHeader.getAttribute("aria-sort")).toBe("ascending");
    const runtimeKeys = getColumnValues(rendered.container, 2);
    expect(runtimeKeys).toEqual(sortTextAscending(runtimeKeys));

    await click(keyHeaderButton);
    expect(keyHeader.getAttribute("aria-sort")).toBe("descending");
    const descendingRuntimeKeys = getColumnValues(rendered.container, 2);
    expect(descendingRuntimeKeys).toEqual(
      sortTextDescending(descendingRuntimeKeys),
    );

    await click(getButtonByText(rendered.container, "Proposals"));
    const proposalsSearch = getInputByPlaceholder(
      rendered.container,
      "Search proposals…",
    );
    await changeInputValue(
      proposalsSearch,
      `${platformModuleId.featureFlags}.proposal.rollout-28`,
    );
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("proposal.rollout-28") ??
        false,
      "Expected runtime proposal search to reveal the requested proposal.",
    );

    await changeInputValue(proposalsSearch, "");
    const { button: proposalKeyHeaderButton, header: proposalKeyHeader } =
      getSortHeader(rendered.container, "Key");

    await click(proposalKeyHeaderButton);
    expect(proposalKeyHeader.getAttribute("aria-sort")).toBe("ascending");
    const proposalKeys = getColumnValues(rendered.container, 2);
    expect(proposalKeys).toEqual(sortTextAscending(proposalKeys));

    await click(proposalKeyHeaderButton);
    expect(proposalKeyHeader.getAttribute("aria-sort")).toBe("descending");
    const descendingProposalKeys = getColumnValues(rendered.container, 2);
    expect(descendingProposalKeys).toEqual(
      sortTextDescending(descendingProposalKeys),
    );

    await click(getButtonByExactText(rendered.container, "2"));
    await waitFor(
      () => rendered?.container.textContent?.includes("26–28 of 28") ?? false,
      "Expected runtime proposal pagination to move to page two.",
    );
  });

  it("covers feature-flag filtering, sorting, and pagination", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      "/governance/feature-flags" as const,
    );

    await waitFor(
      () => rendered?.container.textContent?.includes("Feature Flags") ?? false,
      "Expected feature flags route to render.",
    );

    const search = getInputByPlaceholder(
      rendered.container,
      "Search by key, owner, or description…",
    );
    await changeInputValue(search, "operator-flag-30");
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("operator-flag-30") ?? false,
      "Expected feature-flag search to reveal the targeted row.",
    );

    await changeInputValue(search, "");
    await click(getButtonByText(rendered.container, "Disabled"));
    await waitFor(
      () => rendered?.container.textContent?.includes("disabled") ?? false,
      "Expected disabled feature flags to remain visible after filtering.",
    );
    await changeInputValue(search, "operator-flag-28");
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("operator-flag-28") ?? false,
      "Expected search to continue narrowing results while the disabled filter is active.",
    );
    expect(rendered.container.textContent).not.toContain("operator-flag-30");

    await changeInputValue(search, "");
    await click(getButtonByText(rendered.container, "All"));
    const { button: ownerHeaderButton, header: ownerHeader } = getSortHeader(
      rendered.container,
      "Owner",
    );

    await click(ownerHeaderButton);
    expect(ownerHeader.getAttribute("aria-sort")).toBe("ascending");
    const featureFlagOwners = getColumnValues(rendered.container, 2);
    expect(featureFlagOwners).toEqual(sortTextAscending(featureFlagOwners));

    await click(ownerHeaderButton);
    expect(ownerHeader.getAttribute("aria-sort")).toBe("descending");
    const descendingFeatureFlagOwners = getColumnValues(rendered.container, 2);
    expect(descendingFeatureFlagOwners).toEqual(
      sortTextDescending(descendingFeatureFlagOwners),
    );

    await click(getButtonByExactText(rendered.container, "2"));
    await waitFor(
      () => rendered?.container.textContent?.includes("26–30 of 30") ?? false,
      "Expected feature-flag pagination to move to page two.",
    );
  });

  it("loads exact-scope tuples, paginates, validates comments, and revokes access", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      adminRoutePath.accessControl,
    );

    const objectInput = getFieldControlByLabel<HTMLInputElement>(
      rendered.container,
      "Object",
      "input",
    );
    await changeInputValue(objectInput, "org_demo");

    await click(getButtonByText(rendered.container, "Load tuples"));
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Authorization tuples") ??
        false,
      "Expected tuple review results to render.",
    );
    expect(rendered.container.textContent).toContain("Page 1 of 2");

    await click(getButtonByText(rendered.container, "Next"));
    await waitFor(
      () => rendered?.container.textContent?.includes("Page 2 of 2") ?? false,
      "Expected access-control pagination to move to page two.",
    );

    await click(getButtonByText(rendered.container, "Previous"));
    await waitFor(
      () => rendered?.container.textContent?.includes("Page 1 of 2") ?? false,
      "Expected access-control pagination to move back to page one.",
    );

    const subjectInput = getFieldControlByLabel<HTMLInputElement>(
      rendered.container,
      "Subject filter",
      "input",
    );
    await changeInputValue(subjectInput, "usr_target_revoke");
    await click(getButtonByText(rendered.container, "Load tuples"));
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("usr_target_revoke") ?? false,
      "Expected tuple filtering to reveal the target subject.",
    );

    await click(getButtonByText(rendered.container, "Inspect"));
    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Tuple detail & revocation",
        ) ?? false,
      "Expected tuple detail card to render.",
    );

    await click(getButtonByText(rendered.container, "Revoke tuple"));
    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "This revocation policy requires an operator comment.",
        ) ?? false,
      "Expected comment validation to block tuple revocation.",
    );

    const commentInput = getFieldControlByLabel<HTMLTextAreaElement>(
      rendered.container,
      "Operator comment",
      "textarea",
    );
    await changeInputValue(commentInput, "Tenant offboarding approved.");
    await click(getButtonByText(rendered.container, "Revoke tuple"));

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Revoked viewer access for usr_target_revoke.",
        ) ?? false,
      "Expected tuple revocation success feedback to render.",
    );
    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Selected tuple no longer matches",
        ) ?? false,
      "Expected the revoked tuple to disappear from the exact-scope result set.",
    );

    await click(getButtonByText(rendered.container, "Clear"));
    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Enter namespace, object, and relation",
        ) ?? false,
      "Expected access-control filters to reset back to the empty state.",
    );
  });

  it("applies namespace and relation selector changes before loading exact-scope tuples", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      adminRoutePath.accessControl,
    );

    const namespaceSelect = getFieldControlByLabel<HTMLSelectElement>(
      rendered.container,
      "Namespace",
      "select",
    );
    const objectInput = getFieldControlByLabel<HTMLInputElement>(
      rendered.container,
      "Object",
      "input",
    );
    const relationSelect = getFieldControlByLabel<HTMLSelectElement>(
      rendered.container,
      "Relation",
      "select",
    );

    await changeSelectValue(
      namespaceSelect,
      authorizationNamespace.organization,
    );
    await changeInputValue(objectInput, "ent_atlas");
    await changeSelectValue(relationSelect, authorizationRelation.admin);
    await click(getButtonByText(rendered.container, "Load tuples"));

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("usr_ent_admin_01") ?? false,
      "Expected access-control selector filters to load the enterprise admin tuple.",
    );
    expect(rendered.container.textContent).toContain(
      authorizationNamespace.organization,
    );
    expect(rendered.container.textContent).toContain(
      authorizationRelation.admin,
    );
    expect(rendered.container.textContent).toContain("Matched tuples1");
    expect(rendered.container.textContent).not.toContain("usr_target_revoke");
  });

  it("provisions admin operators through the staffing panel and refreshes the operator directory", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      adminRoutePath.accessControl,
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Operator staffing") ?? false,
      "Expected access-control staffing controls to render.",
    );

    const staffingCard = getCardByTitle(
      rendered.container,
      "Operator staffing",
    );
    const directoryCard = getCardByTitle(rendered.container, "Admin operators");

    await click(getButtonByText(staffingCard, "Provision operator"));
    await waitFor(
      () =>
        staffingCard.textContent?.includes(
          "Display name, email, and staffing reason are required before provisioning an admin operator.",
        ) ?? false,
      "Expected staffing validation to require the mandatory fields.",
    );

    await changeInputValue(
      getFieldControlByLabel<HTMLInputElement>(
        staffingCard,
        "Display name",
        "input",
      ),
      "Comvestec Audit Operator",
    );
    await changeInputValue(
      getFieldControlByLabel<HTMLInputElement>(staffingCard, "Email", "input"),
      "audit.operator@comvestec.com",
    );
    await changeInputValue(
      getFieldControlByLabel<HTMLInputElement>(
        staffingCard,
        "Username (optional)",
        "input",
      ),
      "audit.operator",
    );
    await changeSelectValue(
      getFieldControlByLabel<HTMLSelectElement>(staffingCard, "Role", "select"),
      actorType.platformOperator,
    );
    await changeInputValue(
      getFieldControlByLabel<HTMLInputElement>(
        staffingCard,
        "Staffing reason",
        "input",
      ),
      "Expand internal audit coverage for governance sign-off.",
    );
    await click(getButtonByText(staffingCard, "Provision operator"));
    await waitFor(
      () =>
        staffingCard.textContent?.includes(
          "Provisioned Comvestec Audit Operator for admin access.",
        ) ?? false,
      "Expected operator provisioning success feedback to render.",
    );

    expect(staffingCard.textContent).toContain("Temporary password");
    expect(staffingCard.textContent).toContain("Adm_fixture_operator!aA1");
    expect(staffingCard.textContent).toContain(
      "http://localhost:3004/auth/sign-in",
    );

    await waitFor(
      () =>
        directoryCard.textContent?.includes("audit.operator@comvestec.com") ??
        false,
      "Expected the provisioned operator to appear in the admin operator directory.",
    );
    expect(directoryCard.textContent).toContain("Comvestec Audit Operator");
    expect(directoryCard.textContent).toContain(actorType.platformOperator);
  });

  it("lets support operators inspect access control while keeping staffing controls hidden", async () => {
    rendered = await renderAdminApp(
      createSupportOperatorAccessFixture(),
      adminRoutePath.accessControl,
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Access Control") ?? false,
      "Expected access control to render for support-operator review flows.",
    );

    expect(rendered.container.textContent).toContain(
      "Comvestec Support Operator",
    );
    expect(rendered.container.textContent).toContain(actorType.supportOperator);
    expect(rendered.container.textContent).toContain(
      "Platform operator required",
    );
    expect(rendered.container.textContent).toContain(
      "Operator directory hidden",
    );
    expect(rendered.container.textContent).not.toContain("Provision operator");

    const objectInput = getFieldControlByLabel<HTMLInputElement>(
      rendered.container,
      "Object",
      "input",
    );
    await changeInputValue(objectInput, "org_demo");
    await click(getButtonByText(rendered.container, "Load tuples"));
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Authorization tuples") ??
        false,
      "Expected support operators to keep access-control inspection capabilities.",
    );
  });

  it("filters audit-log activity by module, search, sorting, and pagination", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      adminRoutePath.auditLog,
    );

    await waitFor(
      () => rendered?.container.textContent?.includes("Audit Log") ?? false,
      "Expected audit-log route to render.",
    );

    await click(getButtonByExactText(rendered.container, "2"));
    await waitFor(
      () => rendered?.container.textContent?.includes("26–28 of 28") ?? false,
      "Expected audit-log pagination to move to page two.",
    );

    const moduleSelect = getFieldControlByLabel<HTMLSelectElement>(
      rendered.container,
      "Module",
      "select",
    );
    await changeSelectValue(moduleSelect, platformModuleId.runtimeConfig);
    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          platformModuleId.runtimeConfig,
        ) ?? false,
      "Expected audit-log module filter to navigate to the runtime-config slice.",
    );

    const search = getInputByPlaceholder(
      rendered.container,
      "Search action, target, actor, reason…",
    );
    await changeInputValue(search, "override");
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("override.changed") ?? false,
      "Expected audit-log search to match runtime-config activity.",
    );

    const { button: actorHeaderButton, header: actorHeader } = getSortHeader(
      rendered.container,
      "Actor",
    );

    await click(actorHeaderButton);
    expect(actorHeader.getAttribute("aria-sort")).toBe("ascending");
    const auditActors = getColumnValues(rendered.container, 4);
    expect(auditActors).toEqual(sortTextAscending(auditActors));

    await click(actorHeaderButton);
    expect(actorHeader.getAttribute("aria-sort")).toBe("descending");
    const descendingAuditActors = getColumnValues(rendered.container, 4);
    expect(descendingAuditActors).toEqual(
      sortTextDescending(descendingAuditActors),
    );

    await pushPath(rendered.router, "/governance/runtime-config" as const);
    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Runtime Configuration") ??
        false,
      "Expected shell navigation to remain functional after audit-log filtering.",
    );
  });
});
