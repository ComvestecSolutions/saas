import {
  authorizationConfigKey,
  authorizationFeatureFlag,
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const authorizationFields = defineModuleFields({
  allowSource: "allowSource",
  evaluatedActorType: "evaluatedActorType",
  evaluatedActorId: "evaluatedActorId",
  evaluatedSessionId: "evaluatedSessionId",
  evaluatedCorrelationId: "evaluatedCorrelationId",
  tupleNamespace: "tuple.namespace",
  tupleObject: "tuple.object",
  tupleRelation: "tuple.relation",
  tupleSubject: "tuple.subject",
  decisionAllowed: "decision.allowed",
  decisionReason: "decision.reason",
  decisionAuditRequired: "decision.auditRequired",
  decisionMatchedTupleNamespace: "decision.matchedTuple.namespace",
  decisionMatchedTupleObject: "decision.matchedTuple.object",
  decisionMatchedTupleRelation: "decision.matchedTuple.relation",
  decisionMatchedTupleSubject: "decision.matchedTuple.subject",
  explanationSubjectCandidates: "explanation.subjectCandidates",
  explanationMatchedSubject: "explanation.matchedSubject",
  explanationUsedBreakGlass: "explanation.usedBreakGlass",
  explanationImpersonationActive: "explanation.impersonationActive",
  explanationRequestScope: "explanation.requestScope",
  explanationRequestScopeId: "explanation.requestScopeId",
});

export const authorizationFieldClassifications =
  defineDataClassificationDeclarations(authorizationFields, [
    {
      field: authorizationFields.allowSource,
      classification: dataClassification.internal,
    },
    {
      field: authorizationFields.evaluatedActorType,
      classification: dataClassification.internal,
    },
    {
      field: authorizationFields.evaluatedActorId,
      classification: dataClassification.internal,
    },
    {
      field: authorizationFields.evaluatedSessionId,
      classification: dataClassification.internal,
    },
    {
      field: authorizationFields.evaluatedCorrelationId,
      classification: dataClassification.internal,
    },
    {
      field: authorizationFields.tupleNamespace,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: authorizationFields.tupleObject,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: authorizationFields.tupleRelation,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: authorizationFields.tupleSubject,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: authorizationFields.decisionAllowed,
      classification: dataClassification.internal,
    },
    {
      field: authorizationFields.decisionReason,
      classification: dataClassification.internal,
    },
    {
      field: authorizationFields.decisionAuditRequired,
      classification: dataClassification.internal,
    },
    {
      field: authorizationFields.decisionMatchedTupleNamespace,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: authorizationFields.decisionMatchedTupleObject,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: authorizationFields.decisionMatchedTupleRelation,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: authorizationFields.decisionMatchedTupleSubject,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: authorizationFields.explanationSubjectCandidates,
      classification: dataClassification.internal,
    },
    {
      field: authorizationFields.explanationMatchedSubject,
      classification: dataClassification.internal,
    },
    {
      field: authorizationFields.explanationUsedBreakGlass,
      classification: dataClassification.internal,
    },
    {
      field: authorizationFields.explanationImpersonationActive,
      classification: dataClassification.internal,
    },
    {
      field: authorizationFields.explanationRequestScope,
      classification: dataClassification.internal,
    },
    {
      field: authorizationFields.explanationRequestScopeId,
      classification: dataClassification.internal,
    },
  ]);

export const authorizationManifest = defineModuleManifest({
  moduleId: platformModuleId.authorization,
  configKeys: [
    {
      key: authorizationConfigKey.cacheTtlSeconds,
      description: "Keto decision cache TTL.",
      schema: configSchemaType.number,
      defaultValue: 60,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.authorization,
    },
  ],
  featureFlags: [
    {
      key: authorizationFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.authorization,
      purpose: "Gate authorization module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan: "None — core module.",
    },
  ],
  permissionScopes: [permissionScope.fieldAdmin],
  fieldClassifications: authorizationFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(authorizationFields, [
    {
      profile: projectionProfile.admin,
      visibleFields: [
        authorizationFields.allowSource,
        authorizationFields.evaluatedActorType,
        authorizationFields.evaluatedActorId,
        authorizationFields.evaluatedSessionId,
        authorizationFields.evaluatedCorrelationId,
        authorizationFields.tupleNamespace,
        authorizationFields.tupleObject,
        authorizationFields.tupleRelation,
        authorizationFields.tupleSubject,
        authorizationFields.decisionAllowed,
        authorizationFields.decisionReason,
        authorizationFields.decisionAuditRequired,
        authorizationFields.decisionMatchedTupleNamespace,
        authorizationFields.decisionMatchedTupleObject,
        authorizationFields.decisionMatchedTupleRelation,
        authorizationFields.decisionMatchedTupleSubject,
        authorizationFields.explanationSubjectCandidates,
        authorizationFields.explanationMatchedSubject,
        authorizationFields.explanationUsedBreakGlass,
        authorizationFields.explanationImpersonationActive,
        authorizationFields.explanationRequestScope,
        authorizationFields.explanationRequestScopeId,
      ],
      auditedFields: [
        authorizationFields.evaluatedActorId,
        authorizationFields.tupleSubject,
        authorizationFields.decisionMatchedTupleSubject,
        authorizationFields.explanationSubjectCandidates,
        authorizationFields.explanationMatchedSubject,
      ],
    },
    {
      profile: projectionProfile.summary,
      visibleFields: [
        authorizationFields.allowSource,
        authorizationFields.explanationMatchedSubject,
        authorizationFields.explanationRequestScope,
        authorizationFields.explanationRequestScopeId,
      ],
      auditedFields: [],
    },
  ]),
});
