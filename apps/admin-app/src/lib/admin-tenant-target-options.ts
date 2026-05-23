import {
  serializeAdminTenantTarget,
  type AdminTenantTarget,
} from "./admin-tenant-target";

export type AdminTenantTargetOption = {
  readonly key: string;
  readonly target: AdminTenantTarget;
  readonly label: string;
  readonly description: string;
  readonly searchText: string;
};

type AdminTenantTargetOptionSource = {
  readonly target: AdminTenantTarget;
  readonly displayName: string;
  readonly environment?: string;
  readonly status?: string;
  readonly approvalsOpen?: number;
};

const buildApprovalSummary = (approvalsOpen: number | undefined): string => {
  if (approvalsOpen === undefined) {
    return "operator-ready";
  }

  if (approvalsOpen === 0) {
    return "no approvals open";
  }

  return approvalsOpen === 1
    ? "1 approval open"
    : `${approvalsOpen} approvals open`;
};

export const buildAdminTenantTargetOptions = (
  sources: readonly AdminTenantTargetOptionSource[],
): readonly AdminTenantTargetOption[] =>
  sources.map((source) => {
    const description = [
      source.environment,
      source.target.scope,
      source.status,
      buildApprovalSummary(source.approvalsOpen),
    ]
      .filter((segment): segment is string => typeof segment === "string")
      .join(" · ");

    return {
      key: serializeAdminTenantTarget(source.target),
      target: source.target,
      label: source.displayName,
      description,
      searchText: [
        source.displayName,
        source.target.scope,
        source.target.scopeId,
        source.environment,
        source.status,
      ]
        .filter((segment): segment is string => typeof segment === "string")
        .join(" ")
        .toLowerCase(),
    };
  });
