import "../type-assertions";

import { Schema } from "effect";
import {
  permissionScope,
  PermissionScopeSchema,
  RequestContextSchema,
  TenantContextSchema,
} from "@comvestec/contracts";

describe("contract schemas", () => {
  it("decodes a tenant context", () => {
    const tenantContext = Schema.decodeUnknownSync(TenantContextSchema)({
      scope: "organization",
      scopeId: "org_1",
      enterpriseId: "ent_1",
      organizationId: "org_1",
      individualId: "usr_1",
    });

    expect(tenantContext.scopeId).toBe("org_1");
    expect(tenantContext.organizationId).toBe("org_1");
  });

  it("decodes a standalone individual request context", () => {
    const requestContext = Schema.decodeUnknownSync(RequestContextSchema)({
      actorType: "individual-user",
      actorId: "usr_1",
      sessionId: "sess_1",
      correlationId: "corr_1",
      tenant: {
        scope: "individual",
        scopeId: "usr_1",
        individualId: "usr_1",
      },
    });

    expect(requestContext.tenant.enterpriseId).toBeUndefined();
    expect(requestContext.tenant.organizationId).toBeUndefined();
  });

  it("accepts anonymous public request context", () => {
    const requestContext = Schema.decodeUnknownSync(RequestContextSchema)({
      actorType: "anonymous",
      correlationId: "corr_public",
      host: "www.comvestec.local",
      tenant: {
        scope: "platform",
        scopeId: "platform",
      },
    });

    expect(requestContext.actorId).toBeUndefined();
    expect(requestContext.host).toBe("www.comvestec.local");
  });

  it("accepts request context with non-empty support elevation context", () => {
    const requestContext = Schema.decodeUnknownSync(RequestContextSchema)({
      actorType: "support-operator",
      actorId: "usr_support_1",
      sessionId: "sess_support_1",
      correlationId: "corr_support_1",
      tenant: {
        scope: "organization",
        scopeId: "org_1",
        organizationId: "org_1",
      },
      impersonation: {
        impersonatedActorId: "usr_member_1",
        approvedBy: "usr_admin_1",
        reason: "Investigate customer issue",
      },
      breakGlass: {
        approvedBy: "usr_admin_1",
        reason: "Investigate regulated support incident",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    expect(requestContext.impersonation?.approvedBy).toBe("usr_admin_1");
    expect(requestContext.breakGlass?.reason).toBe(
      "Investigate regulated support incident",
    );
  });

  it("rejects empty break-glass approvers and reasons", () => {
    expect(() =>
      Schema.decodeUnknownSync(RequestContextSchema)({
        actorType: "support-operator",
        actorId: "usr_support_1",
        sessionId: "sess_support_1",
        correlationId: "corr_support_1",
        tenant: {
          scope: "organization",
          scopeId: "org_1",
          organizationId: "org_1",
        },
        breakGlass: {
          approvedBy: "",
          reason: "",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      }),
    ).toThrow();
  });

  it("rejects unknown permission scopes", () => {
    expect(() =>
      Schema.decodeUnknownSync(PermissionScopeSchema)("unknown:scope"),
    ).toThrow();
  });

  it("accepts branding permission scopes", () => {
    const decodedPermissionScope = Schema.decodeUnknownSync(
      PermissionScopeSchema,
    )(permissionScope.brandingManage);

    expect(decodedPermissionScope).toBe(permissionScope.brandingManage);
  });
});
