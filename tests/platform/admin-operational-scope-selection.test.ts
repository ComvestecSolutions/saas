import { afterEach, describe, expect, it, vi } from "vitest";

const {
  getAdminBrandingDataMock,
  getAdminComplianceRetentionDataMock,
  getAdminWebhooksApiAccessDataMock,
} = vi.hoisted(() => ({
  getAdminBrandingDataMock: vi.fn(async () => ({ kind: "no-scope" as const })),
  getAdminComplianceRetentionDataMock: vi.fn(async () => ({
    kind: "no-scope" as const,
  })),
  getAdminWebhooksApiAccessDataMock: vi.fn(async () => ({
    kind: "no-scope" as const,
  })),
}));

vi.mock(
  "../../apps/admin-app/src/lib/operational-route-server",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../apps/admin-app/src/lib/operational-route-server")
      >();
    return {
      ...actual,
      getAdminBrandingData: getAdminBrandingDataMock,
      getAdminComplianceRetentionData: getAdminComplianceRetentionDataMock,
      getAdminWebhooksApiAccessData: getAdminWebhooksApiAccessDataMock,
    };
  },
);

import {
  loadAdminBrandingLoaderData,
  loadAdminComplianceRetentionLoaderData,
  loadAdminWebhooksApiAccessLoaderData,
} from "../../apps/admin-app/src/lib/operational-loaders";
import {
  hasCompleteScopeSelection,
  normalizeScopeSelectionInput,
} from "../../apps/admin-app/src/lib/operational-route-server";

describe("admin operational scope selection", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("preserves a missing scope instead of defaulting branding, compliance, or webhook loaders to organization", async () => {
    await loadAdminBrandingLoaderData(undefined, "ent_demo");
    await loadAdminComplianceRetentionLoaderData(undefined, "ent_demo");
    await loadAdminWebhooksApiAccessLoaderData(undefined, "ent_demo");

    expect(getAdminBrandingDataMock).toHaveBeenCalledWith({
      data: { scope: undefined, scopeId: "ent_demo" },
    });
    expect(getAdminComplianceRetentionDataMock).toHaveBeenCalledWith({
      data: { scope: undefined, scopeId: "ent_demo" },
    });
    expect(getAdminWebhooksApiAccessDataMock).toHaveBeenCalledWith({
      data: { scope: undefined, scopeId: "ent_demo" },
    });
  });

  it("treats scopeId without scope as an incomplete selection", () => {
    expect(normalizeScopeSelectionInput({ scopeId: "ent_demo" })).toEqual({
      scope: undefined,
      scopeId: "ent_demo",
    });
    expect(
      hasCompleteScopeSelection(
        normalizeScopeSelectionInput({ scopeId: "ent_demo" }),
      ),
    ).toBe(false);
    expect(
      hasCompleteScopeSelection(
        normalizeScopeSelectionInput({
          scope: "enterprise",
          scopeId: "ent_demo",
        }),
      ),
    ).toBe(true);
  });
});
