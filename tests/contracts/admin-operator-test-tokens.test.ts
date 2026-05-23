/**
 * Admin-operator-test-tokens contracts tests for §9 item 17 of the
 * admin-app implementation plan + ADR-024 + the accepted module
 * spec at
 * `specs/02-modules/access/admin-operator-test-tokens/spec.md`.
 *
 * Pins:
 *
 *   - schema round-trips for summary / detail / issue (input +
 *     result) / revoke (input + result) / list (input + result)
 *   - the token encoded-form regex accepts `aott_<8>_<52>` and
 *     rejects forbidden Crockford characters and wrong lengths
 *   - the env-bound runtime config schema requires a non-empty
 *     signing key and enforces the documented expiry bounds
 *   - registry membership of `platformModuleId.adminOperatorTestTokens`,
 *     `permissionScope.adminOperatorTestTokensManage`,
 *     `projectionProfile.adminOwnerOnly`, the five
 *     `adminOperatorTestTokensAuditAction.*` entries, and the two
 *     reason-catalog entries (issue requires attachment, revoke
 *     does not, both gate the matching audit action)
 *   - the admin-owner floor predicate is exclusive to the
 *     `admin-owner` admin-org role
 */
import { Schema } from "effect";
import { describe, expect, test } from "vitest";
import {
  AdminOperatorTestTokenDetailSchema,
  AdminOperatorTestTokenEncodedSchema,
  AdminOperatorTestTokenIssueInputSchema,
  AdminOperatorTestTokenIssueResultSchema,
  AdminOperatorTestTokenListInputSchema,
  AdminOperatorTestTokenListResultSchema,
  AdminOperatorTestTokenPrefixSchema,
  AdminOperatorTestTokenRevokeInputSchema,
  AdminOperatorTestTokenRevokeResultSchema,
  AdminOperatorTestTokenSummarySchema,
  AdminOperatorTestTokensRuntimeConfigSchema,
  adminMemberRole,
  adminOperatorTestTokenListStatusFilter,
  adminOperatorTestTokenUsageOutcome,
  adminOperatorTestTokensAuditAction,
  auditActions,
  isAdminOwnerForTestTokens,
  permissionScope,
  permissionScopes,
  platformModuleId,
  platformModuleIds,
  projectionProfile,
  projectionProfiles,
  reasonCatalogId,
  reasonCatalogRegistry,
  type AdminOperatorTestTokenDetail,
  type AdminOperatorTestTokenIssueInput,
  type AdminOperatorTestTokenIssueResult,
  type AdminOperatorTestTokenListInput,
  type AdminOperatorTestTokenListResult,
  type AdminOperatorTestTokenRevokeInput,
  type AdminOperatorTestTokenRevokeResult,
  type AdminOperatorTestTokenSummary,
  type AdminOperatorTestTokensRuntimeConfig,
} from "@comvestec/contracts";

const decodeSummary = Schema.decodeUnknownSync(
  AdminOperatorTestTokenSummarySchema,
);
const decodeDetail = Schema.decodeUnknownSync(
  AdminOperatorTestTokenDetailSchema,
);
const decodeIssueInput = Schema.decodeUnknownSync(
  AdminOperatorTestTokenIssueInputSchema,
);
const decodeIssueResult = Schema.decodeUnknownSync(
  AdminOperatorTestTokenIssueResultSchema,
);
const decodeRevokeInput = Schema.decodeUnknownSync(
  AdminOperatorTestTokenRevokeInputSchema,
);
const decodeRevokeResult = Schema.decodeUnknownSync(
  AdminOperatorTestTokenRevokeResultSchema,
);
const decodeListInput = Schema.decodeUnknownSync(
  AdminOperatorTestTokenListInputSchema,
);
const decodeListResult = Schema.decodeUnknownSync(
  AdminOperatorTestTokenListResultSchema,
);
const decodeEncoded = Schema.decodeUnknownSync(
  AdminOperatorTestTokenEncodedSchema,
);
const decodePrefix = Schema.decodeUnknownSync(
  AdminOperatorTestTokenPrefixSchema,
);
const decodeRuntimeConfig = Schema.decodeUnknownSync(
  AdminOperatorTestTokensRuntimeConfigSchema,
);

const requestContext = {
  actorType: "platform-operator" as const,
  actorId: "usr_owner",
  sessionId: "sess_aott",
  correlationId: "corr_aott",
  tenant: {
    scope: "platform" as const,
    scopeId: "platform",
  },
};

const sampleSummary: AdminOperatorTestTokenSummary = {
  id: "aott_row_1",
  tokenPrefix: "aott_ABCDEFGH",
  label: "ci-harness",
  issuedBy: "usr_owner",
  issuedAt: "2026-05-17T00:00:00.000Z",
  expiresAt: "2026-05-18T00:00:00.000Z",
};

const sampleDetail: AdminOperatorTestTokenDetail = {
  ...sampleSummary,
  revokedAt: "2026-05-17T01:00:00.000Z",
  revokedBy: "usr_owner",
  lastUsedAt: "2026-05-17T00:30:00.000Z",
  lastUsedOutcome: adminOperatorTestTokenUsageOutcome.success,
  reasonCatalogId: reasonCatalogId.adminOperatorTestTokensIssue,
  reasonAttachmentText: "INC-99 runbook",
};

describe("admin-operator-test-tokens schemas", () => {
  test("AdminOperatorTestTokenSummarySchema round-trips minimal active row", () => {
    expect(decodeSummary(sampleSummary)).toStrictEqual(sampleSummary);
  });

  test("AdminOperatorTestTokenDetailSchema round-trips with revoke + last-used metadata", () => {
    expect(decodeDetail(sampleDetail)).toStrictEqual(sampleDetail);
  });

  test("AdminOperatorTestTokenEncodedSchema accepts a canonical aott_<8>_<52> token and rejects forbidden chars", () => {
    const ok =
      "aott_ABCDEFGH_ABCDEFGHJKMNPQRSTVWXYZ23456789ABCDEFGHJKMNPQRSTVWXYZ";
    expect(decodeEncoded(ok)).toBe(ok);
    expect(() =>
      decodeEncoded(
        "aott_ABCDEFGH_0BCDEFGHJKMNPQRSTVWXYZ23456789ABCDEFGHJKMNPQRSTVWXYZ",
      ),
    ).toThrow();
    expect(() => decodeEncoded("aott_ABCDEFGH_short")).toThrow();
    expect(() => decodeEncoded("nope_ABCDEFGH_ABCDEFGH")).toThrow();
  });

  test("AdminOperatorTestTokenPrefixSchema accepts aott_<8> and rejects body-bearing strings", () => {
    expect(decodePrefix("aott_ABCDEFGH")).toBe("aott_ABCDEFGH");
    expect(() => decodePrefix("aott_ABCDEFGH_extra")).toThrow();
    expect(() => decodePrefix("aott_ABC")).toThrow();
  });

  test("AdminOperatorTestTokenIssueInputSchema round-trips and rejects empty reasonAttachmentText", () => {
    const input: AdminOperatorTestTokenIssueInput = {
      requestContext,
      label: "ci-harness",
      expiresAt: "2026-05-18T00:00:00.000Z",
      reasonCatalogId: reasonCatalogId.adminOperatorTestTokensIssue,
      reasonAttachmentText: "INC-99 runbook",
    };
    expect(decodeIssueInput(input)).toStrictEqual(input);
    expect(() =>
      decodeIssueInput({ ...input, reasonAttachmentText: "" }),
    ).toThrow();
  });

  test("AdminOperatorTestTokenIssueResultSchema pairs the summary with a single plaintext token", () => {
    const result: AdminOperatorTestTokenIssueResult = {
      summary: sampleSummary,
      plaintextToken:
        "aott_ABCDEFGH_ABCDEFGHJKMNPQRSTVWXYZ23456789ABCDEFGHJKMNPQRSTVWXYZ",
    };
    expect(decodeIssueResult(result)).toStrictEqual(result);
  });

  test("AdminOperatorTestTokenRevokeInputSchema + result round-trip", () => {
    const input: AdminOperatorTestTokenRevokeInput = {
      requestContext,
      id: "aott_row_1",
      reasonCatalogId: reasonCatalogId.adminOperatorTestTokensRevoke,
    };
    expect(decodeRevokeInput(input)).toStrictEqual(input);
    const result: AdminOperatorTestTokenRevokeResult = {
      summary: { ...sampleSummary, revokedAt: "2026-05-17T01:00:00.000Z" },
    };
    expect(decodeRevokeResult(result)).toStrictEqual(result);
  });

  test("AdminOperatorTestTokenListInputSchema enforces pageSize bounds + status enum", () => {
    const input: AdminOperatorTestTokenListInput = {
      requestContext,
      status: adminOperatorTestTokenListStatusFilter.active,
      pageSize: 50,
      pageToken: "tok_next",
    };
    expect(decodeListInput(input)).toStrictEqual(input);
    expect(() => decodeListInput({ ...input, pageSize: 0 })).toThrow();
    expect(() => decodeListInput({ ...input, pageSize: 500 })).toThrow();
  });

  test("AdminOperatorTestTokenListResultSchema returns typed totals + tokens", () => {
    const result: AdminOperatorTestTokenListResult = {
      tokens: [sampleSummary],
      totals: { active: 1, expiringSoon: 0, revoked: 0 },
    };
    expect(decodeListResult(result)).toStrictEqual(result);
  });

  test("AdminOperatorTestTokensRuntimeConfigSchema requires non-empty signingKey and bounded expiry hours", () => {
    const config: AdminOperatorTestTokensRuntimeConfig = {
      signingKey: "test-signing-key",
      tokenDefaultExpiryHours: 24,
      tokenMaxExpiryHours: 168,
    };
    expect(decodeRuntimeConfig(config)).toStrictEqual(config);
    expect(() => decodeRuntimeConfig({ ...config, signingKey: "" })).toThrow();
    expect(() =>
      decodeRuntimeConfig({ ...config, tokenMaxExpiryHours: 0 }),
    ).toThrow();
  });
});

describe("admin-operator-test-tokens registry pins", () => {
  test("platformModuleId.adminOperatorTestTokens is in the canonical list", () => {
    expect(platformModuleId.adminOperatorTestTokens).toBe(
      "admin-operator-test-tokens",
    );
    expect(platformModuleIds).toContain(
      platformModuleId.adminOperatorTestTokens,
    );
  });

  test("permissionScope.adminOperatorTestTokensManage is in the canonical list", () => {
    expect(permissionScope.adminOperatorTestTokensManage).toBe(
      "admin-operator-test-tokens:manage",
    );
    expect(permissionScopes).toContain(
      permissionScope.adminOperatorTestTokensManage,
    );
  });

  test("projectionProfile.adminOwnerOnly is in the canonical list", () => {
    expect(projectionProfile.adminOwnerOnly).toBe("admin-owner-only");
    expect(projectionProfiles).toContain(projectionProfile.adminOwnerOnly);
  });

  test("adminOperatorTestTokensAuditAction.{issued,revoked,listed,usedSuccess,usedFailure} are in the canonical list", () => {
    expect(adminOperatorTestTokensAuditAction.issued).toBe(
      "admin-operator-test-tokens.issued",
    );
    expect(adminOperatorTestTokensAuditAction.revoked).toBe(
      "admin-operator-test-tokens.revoked",
    );
    expect(adminOperatorTestTokensAuditAction.listed).toBe(
      "admin-operator-test-tokens.listed",
    );
    expect(adminOperatorTestTokensAuditAction.usedSuccess).toBe(
      "admin-operator-test-tokens.used.success",
    );
    expect(adminOperatorTestTokensAuditAction.usedFailure).toBe(
      "admin-operator-test-tokens.used.failure",
    );
    expect(auditActions).toContain(adminOperatorTestTokensAuditAction.issued);
    expect(auditActions).toContain(adminOperatorTestTokensAuditAction.revoked);
    expect(auditActions).toContain(adminOperatorTestTokensAuditAction.listed);
    expect(auditActions).toContain(
      adminOperatorTestTokensAuditAction.usedSuccess,
    );
    expect(auditActions).toContain(
      adminOperatorTestTokensAuditAction.usedFailure,
    );
  });

  test("reasonCatalogId.adminOperatorTestTokensIssue requires attachment and gates the issued audit action", () => {
    const entry = reasonCatalogRegistry.find(
      (e) => e.id === reasonCatalogId.adminOperatorTestTokensIssue,
    );
    expect(entry).toBeDefined();
    if (entry === undefined) {
      throw new Error("registry entry missing");
    }
    expect(entry.moduleId).toBe(platformModuleId.adminOperatorTestTokens);
    expect(entry.requiresAttachment).toBe(true);
    expect(entry.auditActionsGated).toEqual([
      adminOperatorTestTokensAuditAction.issued,
    ]);
  });

  test("reasonCatalogId.adminOperatorTestTokensRevoke does not require attachment and gates the revoked audit action", () => {
    const entry = reasonCatalogRegistry.find(
      (e) => e.id === reasonCatalogId.adminOperatorTestTokensRevoke,
    );
    expect(entry).toBeDefined();
    if (entry === undefined) {
      throw new Error("registry entry missing");
    }
    expect(entry.moduleId).toBe(platformModuleId.adminOperatorTestTokens);
    expect(entry.requiresAttachment).toBe(false);
    expect(entry.auditActionsGated).toEqual([
      adminOperatorTestTokensAuditAction.revoked,
    ]);
  });

  test("isAdminOwnerForTestTokens is exclusive to admin-owner", () => {
    expect(isAdminOwnerForTestTokens(adminMemberRole.adminOwner)).toBe(true);
    expect(isAdminOwnerForTestTokens(adminMemberRole.adminAdmin)).toBe(false);
    expect(isAdminOwnerForTestTokens(adminMemberRole.adminOperator)).toBe(
      false,
    );
    expect(isAdminOwnerForTestTokens(adminMemberRole.supportReviewer)).toBe(
      false,
    );
    expect(isAdminOwnerForTestTokens(adminMemberRole.billingOnly)).toBe(false);
    expect(isAdminOwnerForTestTokens(adminMemberRole.compliance)).toBe(false);
    expect(isAdminOwnerForTestTokens(adminMemberRole.viewer)).toBe(false);
    expect(isAdminOwnerForTestTokens(undefined)).toBe(false);
  });
});
