import { Schema } from "effect";
import {
  dataClassification,
  billingEnforcementMode,
  featureFlagLifecycle,
  ModuleConfigManifestSchema,
  permissionScope,
  platformModuleId,
  projectionProfile,
} from "@comvestec/contracts";
import {
  billingAndMeteringConfigKey,
  billingAndMeteringFeatureFlag,
  featureFlagsFields,
  importExportFields,
  notificationCenterConfigKey,
  notificationCenterFields,
  platformModuleManifests,
  runtimeConfigFields,
  searchFields,
  tenantBrandingFieldClassifications,
  tenantBrandingFeatureFlag,
  tenantBrandingFields,
  tenantManagementFields,
  tenantManagementConfigKey,
  tenantManagementFeatureFlag,
  validatePlatformModuleManifestDeclarations,
} from "@comvestec/config";

describe("contract manifests", () => {
  it("keeps module manifests schema-valid", () => {
    const manifest = Schema.decodeUnknownSync(ModuleConfigManifestSchema)(
      platformModuleManifests[0],
    );
    expect(manifest.moduleId).toBe(platformModuleId.tenantManagement);
  });

  it("registers the tenant-branding module in shared manifests", () => {
    const manifest = platformModuleManifests.find(
      (candidate) => candidate.moduleId === platformModuleId.tenantBranding,
    );

    expect(manifest).toBeDefined();
    expect(manifest?.permissionScopes).toContain(
      permissionScope.brandingManage,
    );
    expect(manifest?.featureFlags.map((flag) => flag.key)).toEqual(
      expect.arrayContaining([
        tenantBrandingFeatureFlag.enabled,
        tenantBrandingFeatureFlag.customDomain,
        tenantBrandingFeatureFlag.brandedEmails,
      ]),
    );
    expect(manifest?.fieldClassifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining(
          tenantBrandingFieldClassifications.find(
            (classification) =>
              classification.field === tenantBrandingFields.replyToEmail,
          ),
        ),
      ]),
    );
  });

  it("keeps tenant-branding projections aligned with branding admin and support-safe surfaces", () => {
    const manifest = platformModuleManifests.find(
      (candidate) => candidate.moduleId === platformModuleId.tenantBranding,
    );
    const summaryProjection = manifest?.projectionProfiles.find(
      (profile) => profile.profile === projectionProfile.summary,
    );
    const adminProjection = manifest?.projectionProfiles.find(
      (profile) => profile.profile === projectionProfile.admin,
    );
    const supportSafeProjection = manifest?.projectionProfiles.find(
      (profile) => profile.profile === projectionProfile.supportSafe,
    );

    expect(summaryProjection).toBeDefined();
    expect(summaryProjection?.visibleFields).toEqual([
      tenantBrandingFields.companyName,
      tenantBrandingFields.logoAssetId,
      tenantBrandingFields.faviconAssetId,
      tenantBrandingFields.theme,
      tenantBrandingFields.supportEmail,
    ]);
    expect(summaryProjection?.auditedFields).toEqual([]);

    expect(adminProjection).toBeDefined();
    expect(adminProjection?.visibleFields).toEqual([
      tenantBrandingFields.companyName,
      tenantBrandingFields.logoAssetId,
      tenantBrandingFields.faviconAssetId,
      tenantBrandingFields.theme,
      tenantBrandingFields.supportEmail,
      tenantBrandingFields.replyToEmail,
      tenantBrandingFields.customDomainHost,
      tenantBrandingFields.customDomainStatus,
      tenantBrandingFields.scope,
    ]);
    expect(adminProjection?.auditedFields).toEqual([
      tenantBrandingFields.replyToEmail,
      tenantBrandingFields.customDomainHost,
    ]);

    expect(supportSafeProjection).toBeDefined();
    expect(supportSafeProjection?.visibleFields).toEqual([
      tenantBrandingFields.companyName,
      tenantBrandingFields.customDomainStatus,
      tenantBrandingFields.scope,
      tenantBrandingFields.changedAt,
    ]);
    expect(supportSafeProjection?.auditedFields).toEqual([
      tenantBrandingFields.customDomainStatus,
    ]);
  });

  it("keeps notification-center digest scheduling opt-in by default", () => {
    const manifest = platformModuleManifests.find(
      (candidate) => candidate.moduleId === platformModuleId.notificationCenter,
    );
    const digestConfig = manifest?.configKeys.find(
      (candidate) =>
        candidate.key === notificationCenterConfigKey.digestIntervalMinutes,
    );

    expect(digestConfig).toEqual(
      expect.objectContaining({
        defaultValue: 0,
      }),
    );
  });

  it("keeps tenant-management sensitive invitation and billing fields classified", () => {
    const manifest = platformModuleManifests.find(
      (candidate) => candidate.moduleId === platformModuleId.tenantManagement,
    );
    const expectedClassifications = [
      {
        field: tenantManagementFields.billingEmail,
        classification: dataClassification.regulatedSensitive,
      },
      {
        field: tenantManagementFields.invitationRecipientEmail,
        classification: dataClassification.regulatedSensitive,
      },
      {
        field: tenantManagementFields.invitationRelation,
        classification: dataClassification.tenantConfidential,
      },
      {
        field: tenantManagementFields.invitationStatus,
        classification: dataClassification.tenantConfidential,
      },
      {
        field: tenantManagementFields.invitationIssuedBy,
        classification: dataClassification.tenantConfidential,
      },
      {
        field: tenantManagementFields.invitationIssuedAt,
        classification: dataClassification.tenantConfidential,
      },
      {
        field: tenantManagementFields.invitationExpiresAt,
        classification: dataClassification.tenantConfidential,
      },
      {
        field: tenantManagementFields.invitationRevokedAt,
        classification: dataClassification.tenantConfidential,
      },
      {
        field: tenantManagementFields.invitationRevokedBy,
        classification: dataClassification.tenantConfidential,
      },
      {
        field: tenantManagementFields.invitationRedeemedAt,
        classification: dataClassification.tenantConfidential,
      },
      {
        field: tenantManagementFields.invitationRedeemedBy,
        classification: dataClassification.tenantConfidential,
      },
    ] as const;

    expect(manifest).toBeDefined();
    expect(manifest?.fieldClassifications).toEqual(
      expect.arrayContaining([
        ...expectedClassifications.map((classification) =>
          expect.objectContaining(classification),
        ),
      ]),
    );
  });

  it("keeps tenant-management admin and support-safe projections aligned with invitation inspection fields", () => {
    const manifest = platformModuleManifests.find(
      (candidate) => candidate.moduleId === platformModuleId.tenantManagement,
    );
    const adminProjection = manifest?.projectionProfiles.find(
      (profile) => profile.profile === projectionProfile.admin,
    );
    const supportSafeProjection = manifest?.projectionProfiles.find(
      (profile) => profile.profile === projectionProfile.supportSafe,
    );

    expect(manifest).toBeDefined();
    expect(adminProjection).toEqual({
      profile: projectionProfile.admin,
      visibleFields: [
        tenantManagementFields.id,
        tenantManagementFields.name,
        tenantManagementFields.status,
        tenantManagementFields.billingEmail,
        tenantManagementFields.memberCount,
        tenantManagementFields.invitationId,
        tenantManagementFields.invitationRecipientEmail,
        tenantManagementFields.invitationRelation,
        tenantManagementFields.invitationStatus,
        tenantManagementFields.invitationIssuedBy,
        tenantManagementFields.invitationIssuedAt,
        tenantManagementFields.invitationExpiresAt,
        tenantManagementFields.invitationRevokedAt,
        tenantManagementFields.invitationRevokedBy,
        tenantManagementFields.invitationRedeemedAt,
        tenantManagementFields.invitationRedeemedBy,
      ],
      auditedFields: [
        tenantManagementFields.billingEmail,
        tenantManagementFields.invitationRecipientEmail,
      ],
    });
    expect(supportSafeProjection).toEqual({
      profile: projectionProfile.supportSafe,
      visibleFields: [
        tenantManagementFields.id,
        tenantManagementFields.name,
        tenantManagementFields.status,
        tenantManagementFields.createdAt,
        tenantManagementFields.invitationId,
        tenantManagementFields.invitationRelation,
        tenantManagementFields.invitationStatus,
        tenantManagementFields.invitationIssuedAt,
        tenantManagementFields.invitationExpiresAt,
        tenantManagementFields.invitationRevokedAt,
        tenantManagementFields.invitationRedeemedAt,
      ],
      auditedFields: [],
    });
  });

  it("rejects unknown module ids in shared manifests", () => {
    expect(() =>
      Schema.decodeUnknownSync(ModuleConfigManifestSchema)({
        moduleId: "not-a-real-module",
        configKeys: [],
        featureFlags: [],
        permissionScopes: [permissionScope.tenantRead],
        fieldClassifications: [],
        projectionProfiles: [],
      }),
    ).toThrow();
  });

  it("decodes a scoped config key declaration", () => {
    const manifest = Schema.decodeUnknownSync(ModuleConfigManifestSchema)({
      moduleId: platformModuleId.tenantManagement,
      configKeys: [
        {
          key: tenantManagementConfigKey.membershipInviteExpiryHours,
          description: "Hours before an invite expires.",
          schema: "number",
          defaultValue: 72,
          billable: false,
          allowedScopes: ["platform", "enterprise", "organization"],
          owner: platformModuleId.tenantManagement,
        },
      ],
      featureFlags: [
        {
          key: tenantManagementFeatureFlag.enterpriseHierarchy,
          description: "Multi-org enterprise hierarchy.",
          owner: platformModuleId.tenantManagement,
          purpose: "Allow enterprises with multiple orgs.",
          defaultEnabled: false,
          billable: true,
          allowedScopes: ["platform", "enterprise"],
          dependencies: [tenantManagementFeatureFlag.enabled],
          lifecycle: featureFlagLifecycle.active,
          retirementPlan: "None — permanent feature gate.",
        },
      ],
      permissionScopes: [
        permissionScope.tenantRead,
        permissionScope.tenantWrite,
      ],
      fieldClassifications: [],
      projectionProfiles: [],
    });

    expect(manifest.configKeys[0]!.key).toBe(
      tenantManagementConfigKey.membershipInviteExpiryHours,
    );
    expect(manifest.featureFlags[0]!.billable).toBe(true);
  });

  it("rejects feature-flag dependencies that do not point to declared flags", () => {
    const manifests = Schema.decodeUnknownSync(
      Schema.Array(ModuleConfigManifestSchema),
    )([
      {
        moduleId: platformModuleId.tenantManagement,
        configKeys: [],
        featureFlags: [
          {
            key: tenantManagementFeatureFlag.enabled,
            description: "Enable tenant management.",
            owner: platformModuleId.tenantManagement,
            purpose: "Gate tenant-management workflows.",
            defaultEnabled: false,
            billable: false,
            allowedScopes: ["platform", "enterprise", "organization"],
            dependencies: [],
            lifecycle: featureFlagLifecycle.active,
            retirementPlan: "None — core module gate.",
          },
          {
            key: tenantManagementFeatureFlag.enterpriseHierarchy,
            description: "Multi-org enterprise hierarchy.",
            owner: platformModuleId.tenantManagement,
            purpose: "Allow enterprises with multiple orgs.",
            defaultEnabled: false,
            billable: true,
            allowedScopes: ["platform", "enterprise"],
            dependencies: ["tenant-management.missingFlag"],
            lifecycle: featureFlagLifecycle.active,
            retirementPlan: "None — permanent feature gate.",
          },
        ],
        permissionScopes: [permissionScope.tenantRead],
        fieldClassifications: [],
        projectionProfiles: [],
      },
    ]);

    expect(() => validatePlatformModuleManifestDeclarations(manifests)).toThrow(
      /is not declared/,
    );
  });

  it("rejects feature-flag dependency cycles", () => {
    const manifests = Schema.decodeUnknownSync(
      Schema.Array(ModuleConfigManifestSchema),
    )([
      {
        moduleId: platformModuleId.tenantManagement,
        configKeys: [],
        featureFlags: [
          {
            key: tenantManagementFeatureFlag.enabled,
            description: "Enable tenant management.",
            owner: platformModuleId.tenantManagement,
            purpose: "Gate tenant-management workflows.",
            defaultEnabled: false,
            billable: false,
            allowedScopes: ["platform", "enterprise", "organization"],
            dependencies: [tenantManagementFeatureFlag.enterpriseHierarchy],
            lifecycle: featureFlagLifecycle.active,
            retirementPlan: "None — core module gate.",
          },
          {
            key: tenantManagementFeatureFlag.enterpriseHierarchy,
            description: "Multi-org enterprise hierarchy.",
            owner: platformModuleId.tenantManagement,
            purpose: "Allow enterprises with multiple orgs.",
            defaultEnabled: false,
            billable: true,
            allowedScopes: ["platform", "enterprise"],
            dependencies: [tenantManagementFeatureFlag.enabled],
            lifecycle: featureFlagLifecycle.active,
            retirementPlan: "None — permanent feature gate.",
          },
        ],
        permissionScopes: [permissionScope.tenantRead],
        fieldClassifications: [],
        projectionProfiles: [],
      },
    ]);

    expect(() => validatePlatformModuleManifestDeclarations(manifests)).toThrow(
      /cycle detected/,
    );
  });

  it("keeps the billing manifest aligned with flexible plan composition defaults", () => {
    const manifest = platformModuleManifests.find(
      (candidate) => candidate.moduleId === platformModuleId.billingAndMetering,
    );

    expect(manifest).toBeDefined();
    expect(manifest?.configKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: billingAndMeteringConfigKey.usageEnforcementMode,
          defaultValue: billingEnforcementMode.observe,
        }),
      ]),
    );
    expect(
      manifest?.projectionProfiles.map((profile) => profile.profile),
    ).toEqual(
      expect.arrayContaining([
        projectionProfile.billing,
        projectionProfile.admin,
        projectionProfile.summary,
      ]),
    );
    expect(manifest?.featureFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: billingAndMeteringFeatureFlag.apiRequests,
        }),
      ]),
    );
  });

  it("keeps the runtime-config admin projection aligned with governance read views", () => {
    const manifest = platformModuleManifests.find(
      (candidate) => candidate.moduleId === platformModuleId.runtimeConfig,
    );
    const adminProjection = manifest?.projectionProfiles.find(
      (profile) => profile.profile === projectionProfile.admin,
    );
    const classifiedFields = manifest?.fieldClassifications.map(
      (classification) => classification.field,
    );

    expect(adminProjection).toBeDefined();
    expect(classifiedFields).not.toContain("effectiveValue");
    expect(adminProjection?.visibleFields).toEqual([
      runtimeConfigFields.moduleId,
      runtimeConfigFields.key,
      runtimeConfigFields.scope,
      runtimeConfigFields.scopeId,
      runtimeConfigFields.value,
      runtimeConfigFields.source,
      runtimeConfigFields.changedBy,
      runtimeConfigFields.changedAt,
      runtimeConfigFields.approvalReason,
      runtimeConfigFields.proposalId,
      runtimeConfigFields.action,
      runtimeConfigFields.artifactPath,
      runtimeConfigFields.runtimeValue,
      runtimeConfigFields.codeValue,
      runtimeConfigFields.status,
      runtimeConfigFields.generatedAt,
      runtimeConfigFields.decidedBy,
      runtimeConfigFields.decisionReason,
      runtimeConfigFields.decidedAt,
    ]);
    expect(adminProjection?.auditedFields).toEqual([
      runtimeConfigFields.value,
      runtimeConfigFields.approvalReason,
      runtimeConfigFields.runtimeValue,
      runtimeConfigFields.codeValue,
      runtimeConfigFields.decidedBy,
      runtimeConfigFields.decisionReason,
    ]);
  });

  it("keeps the feature-flags admin projection aligned with governance read views", () => {
    const manifest = platformModuleManifests.find(
      (candidate) => candidate.moduleId === platformModuleId.featureFlags,
    );
    const adminProjection = manifest?.projectionProfiles.find(
      (profile) => profile.profile === projectionProfile.admin,
    );

    expect(adminProjection).toBeDefined();
    expect(adminProjection?.visibleFields).toEqual([
      featureFlagsFields.key,
      featureFlagsFields.description,
      featureFlagsFields.owner,
      featureFlagsFields.purpose,
      featureFlagsFields.defaultEnabled,
      featureFlagsFields.effectiveState,
      featureFlagsFields.source,
      featureFlagsFields.entitled,
      featureFlagsFields.dependencies,
      featureFlagsFields.lifecycle,
      featureFlagsFields.retirementPlan,
      featureFlagsFields.scope,
    ]);
    expect(adminProjection?.auditedFields).toEqual([
      featureFlagsFields.effectiveState,
    ]);
  });

  it("keeps the notification-center admin projection aligned with receipt inspection", () => {
    const manifest = platformModuleManifests.find(
      (candidate) => candidate.moduleId === platformModuleId.notificationCenter,
    );
    const adminProjection = manifest?.projectionProfiles.find(
      (profile) => profile.profile === projectionProfile.admin,
    );
    const classifiedFields = manifest?.fieldClassifications.map(
      (classification) => classification.field,
    );

    expect(adminProjection).toBeDefined();
    expect(classifiedFields).toEqual(
      expect.arrayContaining([
        notificationCenterFields.id,
        notificationCenterFields.channel,
        notificationCenterFields.family,
        notificationCenterFields.status,
        notificationCenterFields.recipient,
        notificationCenterFields.template,
        notificationCenterFields.actorId,
        notificationCenterFields.sourceModuleId,
        notificationCenterFields.sourceEventId,
        notificationCenterFields.title,
        notificationCenterFields.bodySummary,
        notificationCenterFields.actionLabel,
        notificationCenterFields.actionUrl,
        notificationCenterFields.correlationId,
        notificationCenterFields.correlatedEmailReceiptId,
        notificationCenterFields.correlatedDigestRunId,
        notificationCenterFields.readAt,
        notificationCenterFields.dismissedAt,
        notificationCenterFields.emailDeliveryMessageId,
        notificationCenterFields.queueFailureSummary,
        notificationCenterFields.suppressionReason,
        notificationCenterFields.createdAt,
        notificationCenterFields.enabled,
        notificationCenterFields.updatedBy,
        notificationCenterFields.updatedAt,
      ]),
    );
    expect(adminProjection?.visibleFields).toEqual([
      notificationCenterFields.id,
      notificationCenterFields.channel,
      notificationCenterFields.family,
      notificationCenterFields.status,
      notificationCenterFields.recipient,
      notificationCenterFields.template,
      notificationCenterFields.actorId,
      notificationCenterFields.sourceModuleId,
      notificationCenterFields.sourceEventId,
      notificationCenterFields.title,
      notificationCenterFields.bodySummary,
      notificationCenterFields.actionLabel,
      notificationCenterFields.actionUrl,
      notificationCenterFields.correlationId,
      notificationCenterFields.correlatedEmailReceiptId,
      notificationCenterFields.correlatedDigestRunId,
      notificationCenterFields.readAt,
      notificationCenterFields.dismissedAt,
      notificationCenterFields.emailDeliveryMessageId,
      notificationCenterFields.queueFailureSummary,
      notificationCenterFields.suppressionReason,
      notificationCenterFields.createdAt,
      notificationCenterFields.enabled,
      notificationCenterFields.updatedBy,
      notificationCenterFields.updatedAt,
    ]);
    expect(adminProjection?.auditedFields).toEqual([
      notificationCenterFields.recipient,
      notificationCenterFields.actorId,
      notificationCenterFields.title,
      notificationCenterFields.bodySummary,
      notificationCenterFields.actionLabel,
      notificationCenterFields.actionUrl,
    ]);
  });

  it("keeps the search summary, admin, and support-safe projections aligned with Search query results", () => {
    const manifest = platformModuleManifests.find(
      (candidate) => candidate.moduleId === platformModuleId.search,
    );
    const summaryProjection = manifest?.projectionProfiles.find(
      (profile) => profile.profile === projectionProfile.summary,
    );
    const adminProjection = manifest?.projectionProfiles.find(
      (profile) => profile.profile === projectionProfile.admin,
    );
    const supportSafeProjection = manifest?.projectionProfiles.find(
      (profile) => profile.profile === projectionProfile.supportSafe,
    );
    const fieldClassificationEntries = Object.fromEntries(
      (manifest?.fieldClassifications ?? []).map((classification) => [
        classification.field,
        classification.classification,
      ]),
    );

    expect(summaryProjection).toBeDefined();
    expect(summaryProjection?.visibleFields).toEqual([
      searchFields.fileId,
      searchFields.fileName,
      searchFields.contentType,
      searchFields.sizeBytes,
      searchFields.deletedAt,
    ]);
    expect(summaryProjection?.auditedFields).toEqual([]);
    expect(adminProjection).toBeDefined();
    expect(adminProjection?.visibleFields).toEqual([
      searchFields.fileId,
      searchFields.fileName,
      searchFields.contentType,
      searchFields.sizeBytes,
      searchFields.deletedAt,
    ]);
    expect(adminProjection?.auditedFields).toEqual([]);
    expect(supportSafeProjection).toBeDefined();
    expect(supportSafeProjection?.visibleFields).toEqual([
      searchFields.caseId,
      searchFields.supportAgent,
      searchFields.tenantScope,
      searchFields.tenantScopeId,
      searchFields.summary,
      searchFields.status,
      searchFields.priority,
      searchFields.startedAt,
      searchFields.lastUpdatedAt,
    ]);
    expect(supportSafeProjection?.auditedFields).toEqual([]);
    expect(fieldClassificationEntries).toMatchObject({
      [searchFields.documentId]: dataClassification.internal,
      [searchFields.documentFamily]: dataClassification.internal,
      [searchFields.fileId]: dataClassification.internal,
      [searchFields.fileName]: dataClassification.internal,
      [searchFields.contentType]: dataClassification.internal,
      [searchFields.sizeBytes]: dataClassification.internal,
      [searchFields.deletedAt]: dataClassification.internal,
      [searchFields.caseId]: dataClassification.internal,
      [searchFields.supportAgent]: dataClassification.internal,
      [searchFields.tenantScope]: dataClassification.internal,
      [searchFields.tenantScopeId]: dataClassification.internal,
      [searchFields.summary]: dataClassification.internal,
      [searchFields.status]: dataClassification.internal,
      [searchFields.priority]: dataClassification.internal,
      [searchFields.startedAt]: dataClassification.internal,
      [searchFields.lastUpdatedAt]: dataClassification.internal,
    });
  });

  it("keeps the import-export admin projection aligned with export job inspection", () => {
    const manifest = platformModuleManifests.find(
      (candidate) => candidate.moduleId === platformModuleId.importExport,
    );
    const adminProjection = manifest?.projectionProfiles.find(
      (profile) => profile.profile === projectionProfile.admin,
    );
    const fieldClassificationEntries = Object.fromEntries(
      (manifest?.fieldClassifications ?? []).map((classification) => [
        classification.field,
        classification.classification,
      ]),
    );

    expect(adminProjection).toBeDefined();
    expect(adminProjection?.visibleFields).toEqual([
      importExportFields.jobId,
      importExportFields.tenantScope,
      importExportFields.tenantScopeId,
      importExportFields.source,
      importExportFields.format,
      importExportFields.status,
      importExportFields.rowCount,
      importExportFields.artifactFileId,
      importExportFields.lastError,
      importExportFields.startedAt,
      importExportFields.completedAt,
      importExportFields.createdAt,
    ]);
    expect(adminProjection?.auditedFields).toEqual([]);
    expect(fieldClassificationEntries).toMatchObject({
      [importExportFields.jobId]: dataClassification.internal,
      [importExportFields.tenantScope]: dataClassification.internal,
      [importExportFields.tenantScopeId]: dataClassification.internal,
      [importExportFields.source]: dataClassification.internal,
      [importExportFields.format]: dataClassification.internal,
      [importExportFields.status]: dataClassification.internal,
      [importExportFields.rowCount]: dataClassification.internal,
      [importExportFields.artifactFileId]: dataClassification.internal,
      [importExportFields.lastError]: dataClassification.internal,
      [importExportFields.startedAt]: dataClassification.internal,
      [importExportFields.completedAt]: dataClassification.internal,
      [importExportFields.createdAt]: dataClassification.internal,
    });
  });
});
