import { Effect } from "effect";
import type { PlatformModuleId, RequestContext } from "@comvestec/contracts";
import type {
  RuntimeFeatureFlagRolloutRequest,
  RuntimeFeatureFlagRolloutService,
} from "@comvestec/modules";
import type { UnleashAdapterService } from "../../adapters";

const buildUnleashFeatureFlagEvaluationContext = (input: {
  readonly requestContext: RequestContext;
  readonly moduleId: PlatformModuleId;
}) => ({
  ...(input.requestContext.actorId !== undefined
    ? { userId: input.requestContext.actorId }
    : {}),
  ...(input.requestContext.sessionId !== undefined
    ? { sessionId: input.requestContext.sessionId }
    : {}),
  properties: {
    actorType: input.requestContext.actorType,
    tenantScope: input.requestContext.tenant.scope,
    tenantScopeId: input.requestContext.tenant.scopeId,
    moduleId: input.moduleId,
    ...(input.requestContext.tenant.enterpriseId !== undefined
      ? { enterpriseId: input.requestContext.tenant.enterpriseId }
      : {}),
    ...(input.requestContext.tenant.organizationId !== undefined
      ? { organizationId: input.requestContext.tenant.organizationId }
      : {}),
    ...(input.requestContext.tenant.individualId !== undefined
      ? { individualId: input.requestContext.tenant.individualId }
      : {}),
  },
});

export const makeRuntimeFeatureFlagRollout = (
  unleash: Pick<UnleashAdapterService, "evaluateFeatureFlag">,
): RuntimeFeatureFlagRolloutService => ({
  evaluateFeatureFlag: (input: RuntimeFeatureFlagRolloutRequest) =>
    unleash
      .evaluateFeatureFlag({
        flagKey: input.flag.key,
        fallbackEnabled: input.flag.defaultEnabled,
        context: buildUnleashFeatureFlagEvaluationContext({
          requestContext: input.requestContext,
          moduleId: input.moduleId,
        }),
      })
      .pipe(
        Effect.map((evaluation) => ({
          effectiveValue: evaluation.enabled,
          definitionExists: evaluation.definitionExists,
          ...(evaluation.resolvedScope !== undefined
            ? {
                resolvedScope: evaluation.resolvedScope,
              }
            : {}),
          ...(evaluation.resolvedScopeId !== undefined
            ? {
                resolvedScopeId: evaluation.resolvedScopeId,
              }
            : {}),
        })),
      ),
});
