import {
  adminMemberRole,
  type AdminMember,
  type AdminMemberRole,
} from "@comvestec/contracts";

export const adminMemberRoleLabel: Record<AdminMemberRole, string> = {
  [adminMemberRole.adminOwner]: "Owner",
  [adminMemberRole.adminAdmin]: "Admin",
  [adminMemberRole.adminOperator]: "Operator",
  [adminMemberRole.supportReviewer]: "Support reviewer",
  [adminMemberRole.billingOnly]: "Billing only",
  [adminMemberRole.compliance]: "Compliance",
  [adminMemberRole.viewer]: "Viewer",
};

export const resolveAdminMemberActivityAt = (member: AdminMember): string =>
  member.lastActiveAt ?? member.acceptedAt ?? member.updatedAt;

export const resolveAdminMemberActivityLabel = (member: AdminMember): string =>
  member.lastActiveAt !== undefined
    ? "Last active"
    : member.acceptedAt !== undefined
      ? "Accepted"
      : "Updated";

export const formatAdminMemberDay = (value: string | undefined): string =>
  value === undefined ? "—" : value.slice(0, 10);
