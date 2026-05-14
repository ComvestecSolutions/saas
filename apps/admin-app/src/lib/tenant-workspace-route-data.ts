import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  getAdminTenantWorkspaceFromSessionId,
  type AdminTenantWorkspace,
  type AdminTenantWorkspaceRequest,
} from "@comvestec/platform";

export type AdminTenantWorkspaceRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | { readonly kind: "ready"; readonly workspace: AdminTenantWorkspace };

const defaultAuditQuery: AdminTenantWorkspaceRequest["audit"] = {
  page: { page: 1, pageSize: 20 },
  sortDirection: "desc",
  exportMode: false,
};

export const loadAdminTenantWorkspaceRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  tenantId: string,
  getTenantWorkspace: (
    env: unknown,
    input: AdminTenantWorkspaceRequest,
  ) => ReturnType<typeof getAdminTenantWorkspaceFromSessionId> = (env, input) =>
    getAdminTenantWorkspaceFromSessionId(env, input),
) =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      getTenantWorkspace(environment, {
        sessionId,
        tenant: {
          scope: "organization",
          scopeId: tenantId,
        },
        audit: defaultAuditQuery,
      }).pipe(
        Effect.map(
          (workspace): AdminTenantWorkspaceRouteData => ({
            kind: "ready",
            workspace,
          }),
        ),
      ),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchTag("AdminGovernanceRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("AdminGovernanceRequestContextMalformedError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("IdentitySessionRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("ManagedBillingPlanAccessDeniedError", (error) =>
      Effect.succeed({ kind: "denied", reason: error.reason } as const),
    ),
    Effect.catchAll(() => Effect.succeed({ kind: "stale-session" } as const)),
  );
