/**
 * Admin-operator-test-tokens contracts per
 * `specs/02-modules/access/admin-operator-test-tokens/spec.md` and
 * ADR-024.
 *
 * Owner-locked invariants this surface enforces — pinned both at
 * the schema layer here and at the service layer
 * (`packages/platform/src/services/access/admin-operator-test-tokens-service.ts`):
 *
 *   - **admin-owner hard floor** for every operation (list / issue /
 *     revoke / verify); the platform service rejects every other
 *     admin-org role at the boundary with a typed access-denied
 *     error and never reads through to the repository.
 *   - **no break-glass override**: the reason-catalog entries
 *     `admin-operator-test-tokens.issue` and `.revoke` are both
 *     declared with no break-glass authorization path; the service
 *     contract intentionally does not accept a break-glass context.
 *   - **plaintext returned exactly once** at issue. Subsequent
 *     reads project `tokenPrefix` only; the full encoded token is
 *     never persisted and never re-derivable from any persisted
 *     field.
 *   - **hash-only secret-at-rest**: only `tokenPrefix` (non-secret
 *     correlator) and `tokenHash` (HMAC-SHA-256 of the full
 *     encoded token under the env-bound signing key) hit the DB.
 *   - **env-bound signing key**: the runtime decodes
 *     `ADMIN_OPERATOR_TEST_TOKENS_SIGNING_KEY` through a
 *     `Schema.NonEmptyString`-backed env reader at module boundary
 *     with NO local fallback synthesis; missing/empty value rejects
 *     service construction.
 *
 * The catalog-level `reasonCatalogId.adminOperatorTestTokensIssue`
 * additionally requires a `reasonAttachmentText` per the central
 * reason-catalog registry; the `revoke` entry does not.
 */
import { Schema } from "effect";
import { adminMemberRole, AdminMemberRoleSchema } from "./admin-organization";
import { RequestContextSchema } from "./request-context";
import { IsoTimestampSchema } from "../runtime/timestamps";

// ---------------------------------------------------------------------------
// Token encoded-form schema (`aott_<8>_<52>` Crockford base32)
// ---------------------------------------------------------------------------

/**
 * Literal prefix marker for every admin-operator-test-token. Used
 * by the encode/decode helpers and by the contract regex below so
 * the family of `aott_*` tokens is greppable both in code and in
 * operator-facing logs (never including the body).
 */
export const ADMIN_OPERATOR_TEST_TOKEN_LITERAL_PREFIX = "aott" as const;

/**
 * Full encoded form. Crockford base32 forbids `0`, `1`, `O`, `I` to
 * avoid visual ambiguity. The `<prefix>` group is the 8 Crockford
 * chars after `aott_`; the `<body>` group is the 52-char (256 bit)
 * entropy body. The decoded total length is exactly 66 characters.
 *
 * The regex is lowercase-tolerant; the encode helper at the service
 * layer emits uppercase, but normalization on inbound verification
 * lowercases before the HMAC.
 */
export const AdminOperatorTestTokenEncodedSchema = Schema.NonEmptyString.pipe(
  Schema.pattern(
    /^aott_[abcdefghjkmnpqrstvwxyz2-9]{8}_[abcdefghjkmnpqrstvwxyz2-9]{52}$/i,
  ),
);

export type AdminOperatorTestTokenEncoded = Schema.Schema.Type<
  typeof AdminOperatorTestTokenEncodedSchema
>;

/**
 * Persisted non-secret correlator. Always exactly `aott_<8>`. The
 * service layer reveals this through `RevealField` on the operator
 * desk; routine projections still mask it.
 */
export const AdminOperatorTestTokenPrefixSchema = Schema.NonEmptyString.pipe(
  Schema.pattern(/^aott_[abcdefghjkmnpqrstvwxyz2-9]{8}$/i),
);

export type AdminOperatorTestTokenPrefix = Schema.Schema.Type<
  typeof AdminOperatorTestTokenPrefixSchema
>;

// ---------------------------------------------------------------------------
// Usage-event outcome enums (also reused as audit `failureReason`s)
// ---------------------------------------------------------------------------

const AdminOperatorTestTokenUsageOutcomeConstantSchema = Schema.Struct({
  success: Schema.Literal("success"),
  failure: Schema.Literal("failure"),
});

export const adminOperatorTestTokenUsageOutcome = Schema.validateSync(
  AdminOperatorTestTokenUsageOutcomeConstantSchema,
)({
  success: "success",
  failure: "failure",
} satisfies Schema.Schema.Type<
  typeof AdminOperatorTestTokenUsageOutcomeConstantSchema
>);

export const adminOperatorTestTokenUsageOutcomes = [
  adminOperatorTestTokenUsageOutcome.success,
  adminOperatorTestTokenUsageOutcome.failure,
] as const;

export const AdminOperatorTestTokenUsageOutcomeSchema = Schema.Literal(
  ...adminOperatorTestTokenUsageOutcomes,
);

export type AdminOperatorTestTokenUsageOutcome = Schema.Schema.Type<
  typeof AdminOperatorTestTokenUsageOutcomeSchema
>;

const AdminOperatorTestTokenVerificationFailureReasonConstantSchema =
  Schema.Struct({
    unknown: Schema.Literal("unknown"),
    revoked: Schema.Literal("revoked"),
    expired: Schema.Literal("expired"),
    mismatch: Schema.Literal("mismatch"),
    malformed: Schema.Literal("malformed"),
  });

export const adminOperatorTestTokenVerificationFailureReason =
  Schema.validateSync(
    AdminOperatorTestTokenVerificationFailureReasonConstantSchema,
  )({
    unknown: "unknown",
    revoked: "revoked",
    expired: "expired",
    mismatch: "mismatch",
    malformed: "malformed",
  } satisfies Schema.Schema.Type<
    typeof AdminOperatorTestTokenVerificationFailureReasonConstantSchema
  >);

export const adminOperatorTestTokenVerificationFailureReasons = [
  adminOperatorTestTokenVerificationFailureReason.unknown,
  adminOperatorTestTokenVerificationFailureReason.revoked,
  adminOperatorTestTokenVerificationFailureReason.expired,
  adminOperatorTestTokenVerificationFailureReason.mismatch,
  adminOperatorTestTokenVerificationFailureReason.malformed,
] as const;

export const AdminOperatorTestTokenVerificationFailureReasonSchema =
  Schema.Literal(...adminOperatorTestTokenVerificationFailureReasons);

export type AdminOperatorTestTokenVerificationFailureReason =
  Schema.Schema.Type<
    typeof AdminOperatorTestTokenVerificationFailureReasonSchema
  >;

// ---------------------------------------------------------------------------
// Persisted record / list / detail projections
// ---------------------------------------------------------------------------

/**
 * Projection surfaced to `admin-owner` list views. Maps 1:1 to the
 * `admin-owner-list` projection profile in the module manifest. The
 * `tokenPrefix` field is `secret`-classified and rendered through
 * `RevealField` on the admin app.
 */
export const AdminOperatorTestTokenSummarySchema = Schema.Struct({
  id: Schema.NonEmptyString,
  tokenPrefix: AdminOperatorTestTokenPrefixSchema,
  label: Schema.NonEmptyString,
  issuedBy: Schema.NonEmptyString,
  issuedAt: IsoTimestampSchema,
  expiresAt: IsoTimestampSchema,
  revokedAt: Schema.optional(IsoTimestampSchema),
  lastUsedAt: Schema.optional(IsoTimestampSchema),
  lastUsedOutcome: Schema.optional(AdminOperatorTestTokenUsageOutcomeSchema),
});

export type AdminOperatorTestTokenSummary = Schema.Schema.Type<
  typeof AdminOperatorTestTokenSummarySchema
>;

/**
 * Projection surfaced to `admin-owner` detail views. Maps 1:1 to the
 * `admin-owner-detail` projection profile in the module manifest;
 * superset of the list projection plus `revokedBy`,
 * `reasonCatalogId`, and `reasonAttachmentText`.
 */
export const AdminOperatorTestTokenDetailSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  tokenPrefix: AdminOperatorTestTokenPrefixSchema,
  label: Schema.NonEmptyString,
  issuedBy: Schema.NonEmptyString,
  issuedAt: IsoTimestampSchema,
  expiresAt: IsoTimestampSchema,
  revokedAt: Schema.optional(IsoTimestampSchema),
  revokedBy: Schema.optional(Schema.NonEmptyString),
  lastUsedAt: Schema.optional(IsoTimestampSchema),
  lastUsedOutcome: Schema.optional(AdminOperatorTestTokenUsageOutcomeSchema),
  reasonCatalogId: Schema.NonEmptyString,
  reasonAttachmentText: Schema.optional(Schema.NonEmptyString),
});

export type AdminOperatorTestTokenDetail = Schema.Schema.Type<
  typeof AdminOperatorTestTokenDetailSchema
>;

// ---------------------------------------------------------------------------
// Issue / Revoke / List input + result envelopes
// ---------------------------------------------------------------------------

export const AdminOperatorTestTokenIssueInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  label: Schema.NonEmptyString,
  expiresAt: IsoTimestampSchema,
  reasonCatalogId: Schema.NonEmptyString,
  /**
   * Required by the central reason-catalog entry
   * `admin-operator-test-tokens.issue` (`requiresAttachment: true`).
   * The service rejects an empty value at the boundary; the
   * reason-attachment text lands in the audit row alongside the
   * issued token's id and prefix.
   */
  reasonAttachmentText: Schema.NonEmptyString,
});

export type AdminOperatorTestTokenIssueInput = Schema.Schema.Type<
  typeof AdminOperatorTestTokenIssueInputSchema
>;

/**
 * Result envelope for a successful issue. The `plaintextToken`
 * field is populated exactly once and never re-derivable; the
 * admin-app surfaces it through `RevealField` inside a one-shot
 * `<Dialog>` and never re-fetches it.
 */
export const AdminOperatorTestTokenIssueResultSchema = Schema.Struct({
  summary: AdminOperatorTestTokenSummarySchema,
  plaintextToken: AdminOperatorTestTokenEncodedSchema,
});

export type AdminOperatorTestTokenIssueResult = Schema.Schema.Type<
  typeof AdminOperatorTestTokenIssueResultSchema
>;

export const AdminOperatorTestTokenRevokeInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  id: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

export type AdminOperatorTestTokenRevokeInput = Schema.Schema.Type<
  typeof AdminOperatorTestTokenRevokeInputSchema
>;

export const AdminOperatorTestTokenRevokeResultSchema = Schema.Struct({
  summary: AdminOperatorTestTokenSummarySchema,
});

export type AdminOperatorTestTokenRevokeResult = Schema.Schema.Type<
  typeof AdminOperatorTestTokenRevokeResultSchema
>;

const AdminOperatorTestTokenListStatusFilterConstantSchema = Schema.Struct({
  all: Schema.Literal("all"),
  active: Schema.Literal("active"),
  revoked: Schema.Literal("revoked"),
  expired: Schema.Literal("expired"),
});

export const adminOperatorTestTokenListStatusFilter = Schema.validateSync(
  AdminOperatorTestTokenListStatusFilterConstantSchema,
)({
  all: "all",
  active: "active",
  revoked: "revoked",
  expired: "expired",
} satisfies Schema.Schema.Type<
  typeof AdminOperatorTestTokenListStatusFilterConstantSchema
>);

export const adminOperatorTestTokenListStatusFilters = [
  adminOperatorTestTokenListStatusFilter.all,
  adminOperatorTestTokenListStatusFilter.active,
  adminOperatorTestTokenListStatusFilter.revoked,
  adminOperatorTestTokenListStatusFilter.expired,
] as const;

export const AdminOperatorTestTokenListStatusFilterSchema = Schema.Literal(
  ...adminOperatorTestTokenListStatusFilters,
);

export type AdminOperatorTestTokenListStatusFilter = Schema.Schema.Type<
  typeof AdminOperatorTestTokenListStatusFilterSchema
>;

export const AdminOperatorTestTokenListInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  status: Schema.optional(AdminOperatorTestTokenListStatusFilterSchema),
  pageSize: Schema.optional(
    Schema.Number.pipe(
      Schema.int(),
      Schema.greaterThanOrEqualTo(1),
      Schema.lessThanOrEqualTo(200),
    ),
  ),
  pageToken: Schema.optional(Schema.NonEmptyString),
});

export type AdminOperatorTestTokenListInput = Schema.Schema.Type<
  typeof AdminOperatorTestTokenListInputSchema
>;

export const AdminOperatorTestTokenListResultSchema = Schema.Struct({
  tokens: Schema.Array(AdminOperatorTestTokenSummarySchema),
  nextPageToken: Schema.optional(Schema.NonEmptyString),
  totals: Schema.Struct({
    active: Schema.NonNegativeInt,
    expiringSoon: Schema.NonNegativeInt,
    revoked: Schema.NonNegativeInt,
  }),
});

export type AdminOperatorTestTokenListResult = Schema.Schema.Type<
  typeof AdminOperatorTestTokenListResultSchema
>;

// ---------------------------------------------------------------------------
// Env-bound runtime config (decoded at module boundary, no fallback)
// ---------------------------------------------------------------------------

/**
 * Module runtime config decoded at the env boundary via
 * `Schema.decodeUnknown(...)` with NO local fallback synthesis.
 * The signing key MUST be present and non-empty; missing/empty
 * value raises `AdminOperatorTestTokensSigningKeyMissingError` at
 * runner construction time.
 */
export const AdminOperatorTestTokensRuntimeConfigSchema = Schema.Struct({
  signingKey: Schema.NonEmptyString,
  tokenDefaultExpiryHours: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(1),
    Schema.lessThanOrEqualTo(24 * 365),
  ),
  tokenMaxExpiryHours: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThanOrEqualTo(1),
    Schema.lessThanOrEqualTo(24 * 365),
  ),
});

export type AdminOperatorTestTokensRuntimeConfig = Schema.Schema.Type<
  typeof AdminOperatorTestTokensRuntimeConfigSchema
>;

// ---------------------------------------------------------------------------
// Admin-owner hard floor — pure predicate exported for service +
// helper tests so the rule lives in one greppable spot.
// ---------------------------------------------------------------------------

/**
 * Owner-locked admin-org floor for the test-token surface. Returns
 * `true` only when the actor holds the canonical `admin-owner`
 * admin-org role. The platform service composes this above the
 * `AdminOrganizationRepository.getMembershipByKeycloakSubjectId`
 * lookup; reviewers can grep `isAdminOwnerForTestTokens` to find
 * every authorization site.
 */
export const isAdminOwnerForTestTokens = (
  role: Schema.Schema.Type<typeof AdminMemberRoleSchema> | undefined,
): boolean => role === adminMemberRole.adminOwner;
