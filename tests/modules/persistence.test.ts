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
  });
});
