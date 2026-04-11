import { actorType, platformScope } from "@comvestec/contracts";

export const organizationRequestContext = {
  actorType: actorType.organizationMember,
  actorId: "usr_member_1",
  sessionId: "sess_member_1",
  correlationId: "corr-org-1",
  tenant: {
    scope: platformScope.organization,
    scopeId: "org_1",
    enterpriseId: "ent_1",
    organizationId: "org_1",
    individualId: "usr_member_1",
  },
};

export const supportRequestContext = {
  actorType: actorType.supportOperator,
  actorId: "usr_support_1",
  sessionId: "sess_support_1",
  correlationId: "corr-support-1",
  reason: "Investigate tenant issue",
  tenant: {
    scope: platformScope.organization,
    scopeId: "org_1",
    enterpriseId: "ent_1",
    organizationId: "org_1",
  },
};
