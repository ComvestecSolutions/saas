import { adminOrgRole, type AdminOrgRole } from "@comvestec/contracts";

export const adminOrgRoleLabel: Record<AdminOrgRole, string> = {
  [adminOrgRole.owner]: "Owner",
  [adminOrgRole.admin]: "Admin",
  [adminOrgRole.viewer]: "Viewer",
  [adminOrgRole.none]: "Unassigned",
};

export const adminOrgRoleSummary: Record<AdminOrgRole, string> = {
  [adminOrgRole.owner]:
    "Full platform control with the final escalation path for the admin organization.",
  [adminOrgRole.admin]:
    "Operational admin access across governed control-plane surfaces.",
  [adminOrgRole.viewer]:
    "Review-oriented access with constrained operator controls.",
  [adminOrgRole.none]:
    "No admin-organization membership has been resolved for this session.",
};
