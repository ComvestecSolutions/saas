import { getPostgresSchemaColumnNames } from "@comvestec/modules";

describe("modules persistence", () => {
  it("declares PostgreSQL-owned schema tables for core system records", () => {
    const columns = getPostgresSchemaColumnNames();

    expect(columns.auditLogEventsTable).toEqual(
      expect.arrayContaining(["eventId", "moduleId", "requestContext"]),
    );
    expect(columns.runtimeConfigOverridesTable).toEqual(
      expect.arrayContaining(["overrideId", "key", "scope", "value"]),
    );
    expect(columns.runtimeConfigSyncArtifactsTable).toEqual(
      expect.arrayContaining(["proposalId", "artifactPath", "status"]),
    );
    expect(columns.identitySessionAuditTable).toEqual(
      expect.arrayContaining(["sessionId", "eventType", "metadata"]),
    );
    expect(columns.tenantBrandingDomainVerificationTable).toEqual(
      expect.arrayContaining(["requestedHost", "lifecycleState", "dnsProof"]),
    );
    expect(columns.billingEntitlementsTable).toEqual(
      expect.arrayContaining(["featureKey", "active", "quotaSnapshot"]),
    );
    expect(columns.billingPlansTable).toEqual(
      expect.arrayContaining(["planKey", "displayName", "active"]),
    );
    expect(columns.billingPlanPricesTable).toEqual(
      expect.arrayContaining([
        "billingInterval",
        "amountMinor",
        "providerPriceId",
      ]),
    );
    expect(columns.billingPlanEntitlementsTable).toEqual(
      expect.arrayContaining(["metered", "quotaLimit", "enforcementMode"]),
    );
    expect(columns.billingCustomerAccountsTable).toEqual(
      expect.arrayContaining(["providerCustomerId", "status", "metadata"]),
    );
    expect(columns.billingSubscriptionsTable).toEqual(
      expect.arrayContaining(["providerSubscriptionId", "planId", "status"]),
    );
    expect(columns.billingPaymentEventsTable).toEqual(
      expect.arrayContaining(["providerEventId", "eventType", "payload"]),
    );
    expect(columns.webhookReceiptsTable).toEqual(
      expect.arrayContaining([
        "deliveryId",
        "processingState",
        "verifiedSignature",
      ]),
    );
    expect(columns.tenantOnboardingRunsTable).toEqual(
      expect.arrayContaining(["tenantScopeId", "status", "correlationId"]),
    );
    expect(columns.tenantOnboardingStepsTable).toEqual(
      expect.arrayContaining(["stepId", "status", "retryCount"]),
    );
  });
});
