/**
 * Admin-operator-test-tokens platform service
 * (admin-app implementation plan §9 item 17; ADR-024;
 * `specs/02-modules/access/admin-operator-test-tokens/spec.md`).
 *
 * Composes:
 *   - `AdminOperatorTestTokensRepository` — typed Postgres
 *     persistence (issue / find-by-prefix / list / revoke /
 *     record-usage / trim-usage), boundary-decoded into the
 *     `AdminOperatorTestTokenSummary` / `AdminOperatorTestTokenDetail`
 *     contracts. Owns no authorization, no crypto.
 *   - `AdminOrganizationRepository` — used solely to enforce the
 *     **admin-owner hard floor** before every read/write through
 *     `getMembershipByKeycloakSubjectId(actorId)`. The service
 *     never reads through to the test-tokens repository for any
 *     other admin-org role.
 *   - `AuditLogModule` — exactly one append per accepted op
 *     (`issued` / `revoked` / `listed` / `usedSuccess` /
 *     `usedFailure`), keyed by `platformModuleId.adminOperatorTestTokens`
 *     and a typed `reasonCatalogId.*` reason that is validated
 *     against the central reason catalog via
 *     `validateReasonForAction(...)` BEFORE the audit append.
 *
 * Cross-cutting invariants this file enforces (NOT in the
 * repository or the contracts):
 *
 *   - **Admin-owner hard floor**: every operation rejects non
 *     `admin-owner` roles at the boundary with a typed
 *     {@link AdminOperatorTestTokensAccessDenied} error, evaluated
 *     through `isAdminOwnerForTestTokens` over the membership row
 *     resolved by `AdminOrganizationRepository`.
 *   - **No break-glass override**: the catalog entries for
 *     `admin-operator-test-tokens.issue/.revoke` declare no
 *     break-glass authorization path, and the service intentionally
 *     does not accept a privileged break-glass context.
 *   - **Reason-catalog validation**: `validateReasonForAction` is
 *     called for `issued` / `revoked` BEFORE persistence; mismatch
 *     surfaces as {@link AdminOperatorTestTokensReasonInvalid}.
 *   - **Reason attachment required** on issue (catalog says
 *     `requiresAttachment: true`); empty / missing surfaces as
 *     {@link AdminOperatorTestTokensReasonAttachmentMissing}.
 *   - **Plaintext-once at issue**: the encoded token is returned
 *     exactly once in the issue result; only `tokenPrefix` + HMAC
 *     digest are persisted; no read path can re-derive the
 *     plaintext.
 *   - **HMAC-SHA-256 + constant-time verify**: the persisted hash
 *     is the HMAC-SHA-256 of the encoded token under the env-bound
 *     signing key; verification recomputes and compares with a
 *     constant-time string equality check.
 *   - **Prefix-collision retry**: the unique-prefix path retries
 *     up to {@link ADMIN_OPERATOR_TEST_TOKENS_PREFIX_RETRY_BUDGET}
 *     re-rolls before surfacing
 *     {@link AdminOperatorTestTokensPrefixExhaustedError}.
 *
 * Runtime config:
 *   The env-bound runner decodes
 *   `AdminOperatorTestTokensRuntimeConfigSchema` (signing key +
 *   default / max expiry hours) plus `POSTGRES_URL`, with no local
 *   fallback synthesis.
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  ADMIN_OPERATOR_TEST_TOKEN_LITERAL_PREFIX,
  AdminOperatorTestTokenEncodedSchema,
  AdminOperatorTestTokenIssueInputSchema,
  AdminOperatorTestTokenListInputSchema,
  AdminOperatorTestTokenRevokeInputSchema,
  AdminOperatorTestTokensRuntimeConfigSchema,
  adminOperatorTestTokenListStatusFilter,
  adminOperatorTestTokenUsageOutcome,
  adminOperatorTestTokenVerificationFailureReason,
  adminOperatorTestTokensAuditAction,
  isAdminOwnerForTestTokens,
  platformModuleId,
  reasonCatalogId,
  RequestContextSchema,
  validateReasonForAction,
  type AdminOperatorTestTokenEncoded,
  type AdminOperatorTestTokenIssueInput,
  type AdminOperatorTestTokenIssueResult,
  type AdminOperatorTestTokenListInput,
  type AdminOperatorTestTokenListResult,
  type AdminOperatorTestTokenRevokeInput,
  type AdminOperatorTestTokenRevokeResult,
  type AdminOperatorTestTokenSummary,
  type AdminOperatorTestTokenVerificationFailureReason,
  type AuditAction,
  type ReasonCatalogId,
  type RequestContext,
} from "@comvestec/contracts";
import {
  classifyAdminOperatorTestToken,
  computeAdminOperatorTestTokenListTotals,
} from "@comvestec/modules";
import {
  AdminOperatorTestTokensRepository,
  type AdminOperatorTestTokensRepositoryError,
  type AdminOperatorTestTokensRepositoryService,
  AdminOrganizationRepository,
  type AdminOrganizationRepositoryError,
  type AdminOrganizationRepositoryService,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  auditLogEventsTable,
  makeAdminOperatorTestTokensRepositoryLayer,
  makeAdminOrganizationRepositoryLayer,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
} from "@comvestec/modules";
import {
  makePostgresAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class AdminOperatorTestTokensAccessDenied {
  readonly _tag = "AdminOperatorTestTokensAccessDenied" as const;
  constructor(
    readonly args: {
      readonly requestingActorId: string | undefined;
      readonly operation: "list" | "issue" | "revoke" | "verify";
      readonly reason: "non-admin-owner" | "no-membership";
    },
  ) {}
}

export class AdminOperatorTestTokensMissingActor {
  readonly _tag = "AdminOperatorTestTokensMissingActor" as const;
  constructor(
    readonly args: {
      readonly operation: "list" | "issue" | "revoke" | "verify";
    },
  ) {}
}

export class AdminOperatorTestTokensReasonInvalid {
  readonly _tag = "AdminOperatorTestTokensReasonInvalid" as const;
  constructor(
    readonly args: {
      readonly operation: "issue" | "revoke";
      readonly providedReasonCatalogId: string;
      readonly expectedAuditAction: AuditAction;
    },
  ) {}
}

export class AdminOperatorTestTokensReasonAttachmentMissing {
  readonly _tag = "AdminOperatorTestTokensReasonAttachmentMissing" as const;
  constructor(readonly args: { readonly reasonCatalogId: string }) {}
}

export class AdminOperatorTestTokensExpiryOutOfRange {
  readonly _tag = "AdminOperatorTestTokensExpiryOutOfRange" as const;
  constructor(
    readonly args: {
      readonly expiresAt: string;
      readonly now: string;
      readonly maxExpiryHours: number;
    },
  ) {}
}

export class AdminOperatorTestTokensPrefixExhaustedError {
  readonly _tag = "AdminOperatorTestTokensPrefixExhaustedError" as const;
  constructor(readonly args: { readonly attempts: number }) {}
}

export class AdminOperatorTestTokensVerifyResultError {
  readonly _tag = "AdminOperatorTestTokensVerifyResultError" as const;
  constructor(
    readonly args: {
      readonly failureReason: AdminOperatorTestTokenVerificationFailureReason;
    },
  ) {}
}

export type AdminOperatorTestTokensServiceError =
  | ParseResult.ParseError
  | AdminOperatorTestTokensRepositoryError
  | AdminOrganizationRepositoryError
  | AuditLogModuleError
  | AdminOperatorTestTokensAccessDenied
  | AdminOperatorTestTokensMissingActor
  | AdminOperatorTestTokensReasonInvalid
  | AdminOperatorTestTokensReasonAttachmentMissing
  | AdminOperatorTestTokensExpiryOutOfRange
  | AdminOperatorTestTokensPrefixExhaustedError;

// ---------------------------------------------------------------------------
// Verify input schema (the issue / revoke / list schemas already live
// in `@comvestec/contracts`).
// ---------------------------------------------------------------------------

export const AdminOperatorTestTokenVerifyInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  encodedToken: Schema.NonEmptyString,
  correlationId: Schema.NonEmptyString,
});

export type AdminOperatorTestTokenVerifyInput = Schema.Schema.Type<
  typeof AdminOperatorTestTokenVerifyInputSchema
>;

export type AdminOperatorTestTokenVerifyResult =
  | {
      readonly outcome: "success";
      readonly tokenId: string;
      readonly summary: AdminOperatorTestTokenSummary;
    }
  | {
      readonly outcome: "failure";
      readonly failureReason: AdminOperatorTestTokenVerificationFailureReason;
      readonly tokenId?: string;
    };

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

export const ADMIN_OPERATOR_TEST_TOKENS_PREFIX_RETRY_BUDGET = 5;
export const ADMIN_OPERATOR_TEST_TOKENS_USAGE_RING_LIMIT = 50;
export const ADMIN_OPERATOR_TEST_TOKENS_LIST_DEFAULT_PAGE_SIZE = 50;
export const ADMIN_OPERATOR_TEST_TOKENS_EXPIRING_WINDOW_MS =
  24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export type AdminOperatorTestTokensServiceImpl = {
  readonly list: (
    input: AdminOperatorTestTokenListInput,
  ) => Effect.Effect<
    AdminOperatorTestTokenListResult,
    AdminOperatorTestTokensServiceError
  >;
  readonly issueToken: (
    input: AdminOperatorTestTokenIssueInput,
  ) => Effect.Effect<
    AdminOperatorTestTokenIssueResult,
    AdminOperatorTestTokensServiceError
  >;
  readonly revokeToken: (
    input: AdminOperatorTestTokenRevokeInput,
  ) => Effect.Effect<
    AdminOperatorTestTokenRevokeResult,
    AdminOperatorTestTokensServiceError
  >;
  readonly verifyToken: (
    input: AdminOperatorTestTokenVerifyInput,
  ) => Effect.Effect<
    AdminOperatorTestTokenVerifyResult,
    AdminOperatorTestTokensServiceError
  >;
};

export class AdminOperatorTestTokensService extends Context.Tag(
  "AdminOperatorTestTokensService",
)<AdminOperatorTestTokensService, AdminOperatorTestTokensServiceImpl>() {}

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

const decodeIssueInput = Schema.decodeUnknown(
  AdminOperatorTestTokenIssueInputSchema,
);
const decodeRevokeInput = Schema.decodeUnknown(
  AdminOperatorTestTokenRevokeInputSchema,
);
const decodeListInput = Schema.decodeUnknown(
  AdminOperatorTestTokenListInputSchema,
);
const decodeVerifyInput = Schema.decodeUnknown(
  AdminOperatorTestTokenVerifyInputSchema,
);
const decodeEncodedToken = Schema.decodeUnknown(
  AdminOperatorTestTokenEncodedSchema,
);

// ---------------------------------------------------------------------------
// Crockford-style alphabet (matches the regex on
// `AdminOperatorTestTokenEncodedSchema`: lowercase, no 0/1/i/l/o/u).
// ---------------------------------------------------------------------------

const CROCKFORD_ALPHABET = "abcdefghjkmnpqrstvwxyz23456789";
const ALPHABET_LENGTH = CROCKFORD_ALPHABET.length;
const REJECTION_THRESHOLD = Math.floor(256 / ALPHABET_LENGTH) * ALPHABET_LENGTH;

const generateCrockfordString = (length: number): string => {
  const out: string[] = [];
  // Pull random bytes one buffer at a time, rejection-sampling to
  // remove modulo bias against the 30-char alphabet.
  while (out.length < length) {
    const buffer = crypto.getRandomValues(new Uint8Array(length * 2));
    for (let i = 0; i < buffer.length && out.length < length; i += 1) {
      const byte = buffer[i] ?? 0;
      if (byte < REJECTION_THRESHOLD) {
        out.push(CROCKFORD_ALPHABET[byte % ALPHABET_LENGTH] ?? "a");
      }
    }
  }
  return out.join("");
};

const generateEncodedToken = (): AdminOperatorTestTokenEncoded => {
  const prefix = generateCrockfordString(8);
  const body = generateCrockfordString(52);
  return `${ADMIN_OPERATOR_TEST_TOKEN_LITERAL_PREFIX}_${prefix}_${body}` as AdminOperatorTestTokenEncoded;
};

const extractPrefixFromEncoded = (encoded: string): string =>
  `${ADMIN_OPERATOR_TEST_TOKEN_LITERAL_PREFIX}_${encoded.slice(5, 13)}`;

// ---------------------------------------------------------------------------
// HMAC-SHA-256 helpers (Web Crypto; matches the platform pattern in
// `admin-organization-service.ts`).
// ---------------------------------------------------------------------------

const encodeBytesAsHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const computeTokenHmacHex = (signingKey: string, encodedToken: string) =>
  Effect.tryPromise({
    try: async () => {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(signingKey),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature = new Uint8Array(
        await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(encodedToken),
        ),
      );
      return encodeBytesAsHex(signature);
    },
    catch: (cause) => cause,
  }).pipe(Effect.orDie);

// Constant-time string equality. Returns `false` on length mismatch
// (length itself is not secret — it is the public hex digest length).
export const constantTimeStringEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  let accumulator = 0;
  for (let i = 0; i < a.length; i += 1) {
    accumulator |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return accumulator === 0;
};

// ---------------------------------------------------------------------------
// Admin-owner floor
// ---------------------------------------------------------------------------

const requireAdminOwner = (
  organizationRepository: AdminOrganizationRepositoryService,
  requestContext: RequestContext,
  operation: AdminOperatorTestTokensAccessDenied["args"]["operation"],
) =>
  Effect.gen(function* () {
    const actorId = requestContext.actorId;
    if (actorId === undefined) {
      return yield* Effect.fail(
        new AdminOperatorTestTokensMissingActor({ operation }),
      );
    }
    const membership =
      yield* organizationRepository.getMembershipByKeycloakSubjectId(actorId);
    if (Option.isNone(membership)) {
      return yield* Effect.fail(
        new AdminOperatorTestTokensAccessDenied({
          requestingActorId: actorId,
          operation,
          reason: "no-membership",
        }),
      );
    }
    if (!isAdminOwnerForTestTokens(membership.value.role)) {
      return yield* Effect.fail(
        new AdminOperatorTestTokensAccessDenied({
          requestingActorId: actorId,
          operation,
          reason: "non-admin-owner",
        }),
      );
    }
    return actorId;
  });

// ---------------------------------------------------------------------------
// Audit emission helper
// ---------------------------------------------------------------------------

const appendAuditEvent = (
  auditLog: AuditLogModuleService,
  input: {
    readonly requestContext: RequestContext;
    readonly action: (typeof adminOperatorTestTokensAuditAction)[keyof typeof adminOperatorTestTokensAuditAction];
    readonly target: string;
    readonly reason: ReasonCatalogId;
  },
) =>
  auditLog.append({
    requestContext: input.requestContext,
    moduleId: platformModuleId.adminOperatorTestTokens,
    action: input.action,
    target: input.target,
    reason: input.reason,
  });

// ---------------------------------------------------------------------------
// Reason-catalog gate
// ---------------------------------------------------------------------------

const requireReasonGatesAction = (
  providedReasonCatalogId: string,
  expectedAuditAction: AuditAction,
  operation: AdminOperatorTestTokensReasonInvalid["args"]["operation"],
) =>
  validateReasonForAction(
    providedReasonCatalogId as ReasonCatalogId,
    expectedAuditAction,
  )
    ? Effect.succeed(providedReasonCatalogId as ReasonCatalogId)
    : Effect.fail(
        new AdminOperatorTestTokensReasonInvalid({
          operation,
          providedReasonCatalogId,
          expectedAuditAction,
        }),
      );

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export type AdminOperatorTestTokensServiceOptions = {
  readonly signingKey: string;
  readonly maxExpiryHours: number;
};

export const makeAdminOperatorTestTokensService = (
  repository: AdminOperatorTestTokensRepositoryService,
  organizationRepository: AdminOrganizationRepositoryService,
  auditLog: AuditLogModuleService,
  options: AdminOperatorTestTokensServiceOptions,
): AdminOperatorTestTokensServiceImpl => {
  const list: AdminOperatorTestTokensServiceImpl["list"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListInput(input);
      yield* requireAdminOwner(
        organizationRepository,
        decoded.requestContext,
        "list",
      );
      const pageSize =
        decoded.pageSize ?? ADMIN_OPERATOR_TEST_TOKENS_LIST_DEFAULT_PAGE_SIZE;
      const rows = yield* repository.listSummaries({ limit: pageSize });
      const statusFilter =
        decoded.status ?? adminOperatorTestTokenListStatusFilter.all;
      const now = Date.now();
      const filtered =
        statusFilter === adminOperatorTestTokenListStatusFilter.all
          ? rows
          : rows.filter(
              (row) =>
                classifyAdminOperatorTestToken(row, now) === statusFilter,
            );
      const totals = computeAdminOperatorTestTokenListTotals(rows, {
        now,
        expiringWithinMs: ADMIN_OPERATOR_TEST_TOKENS_EXPIRING_WINDOW_MS,
      });
      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: adminOperatorTestTokensAuditAction.listed,
        target: `admin-operator-test-tokens:${statusFilter}:${pageSize}`,
        reason: reasonCatalogId.adminOperatorTestTokensIssue,
      }).pipe(Effect.ignore);
      return {
        tokens: filtered,
        totals,
      };
    });

  const issueToken: AdminOperatorTestTokensServiceImpl["issueToken"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeIssueInput(input);
      const actorId = yield* requireAdminOwner(
        organizationRepository,
        decoded.requestContext,
        "issue",
      );
      const reasonId = yield* requireReasonGatesAction(
        decoded.reasonCatalogId,
        adminOperatorTestTokensAuditAction.issued,
        "issue",
      );
      if (reasonId !== reasonCatalogId.adminOperatorTestTokensIssue) {
        return yield* Effect.fail(
          new AdminOperatorTestTokensReasonInvalid({
            operation: "issue",
            providedReasonCatalogId: reasonId,
            expectedAuditAction: adminOperatorTestTokensAuditAction.issued,
          }),
        );
      }
      // Catalog declares `requiresAttachment: true` for issue; the
      // contract schema already requires `reasonAttachmentText` as
      // `Schema.NonEmptyString`, but we re-assert here so that a
      // service-internal call without the schema decode still
      // surfaces the typed error rather than silently dropping
      // attachment metadata in the audit row.
      if (
        decoded.reasonAttachmentText === undefined ||
        decoded.reasonAttachmentText.trim().length === 0
      ) {
        return yield* Effect.fail(
          new AdminOperatorTestTokensReasonAttachmentMissing({
            reasonCatalogId: reasonId,
          }),
        );
      }

      const now = new Date();
      const expiresAtMs = new Date(decoded.expiresAt).getTime();
      if (
        !Number.isFinite(expiresAtMs) ||
        expiresAtMs <= now.getTime() ||
        expiresAtMs - now.getTime() > options.maxExpiryHours * 60 * 60 * 1000
      ) {
        return yield* Effect.fail(
          new AdminOperatorTestTokensExpiryOutOfRange({
            expiresAt: decoded.expiresAt,
            now: now.toISOString(),
            maxExpiryHours: options.maxExpiryHours,
          }),
        );
      }

      // Issue with bounded prefix-collision retry. Re-roll the
      // prefix (and therefore the entire encoded token + hash) when
      // the repository surfaces
      // `AdminOperatorTestTokensUniquePrefixViolationError`; bail
      // with the typed exhaustion error if the budget is consumed.
      let attempt = 0;
      while (attempt < ADMIN_OPERATOR_TEST_TOKENS_PREFIX_RETRY_BUDGET) {
        attempt += 1;
        const encodedToken = generateEncodedToken();
        const tokenPrefix = extractPrefixFromEncoded(encodedToken);
        const tokenHash = yield* computeTokenHmacHex(
          options.signingKey,
          encodedToken,
        );
        const issued = yield* repository
          .issueToken({
            tokenPrefix,
            tokenHash,
            label: decoded.label,
            issuedBy: actorId,
            issuedAt: now.toISOString(),
            expiresAt: decoded.expiresAt,
            reasonCatalogId: reasonId,
            reasonAttachmentText: decoded.reasonAttachmentText,
          })
          .pipe(
            Effect.map(Option.some),
            Effect.catchTag(
              "AdminOperatorTestTokensUniquePrefixViolationError",
              () => Effect.succeed(Option.none()),
            ),
          );
        if (Option.isSome(issued)) {
          const detail = issued.value;
          const summary: AdminOperatorTestTokenSummary = {
            id: detail.id,
            tokenPrefix: detail.tokenPrefix,
            label: detail.label,
            issuedBy: detail.issuedBy,
            issuedAt: detail.issuedAt,
            expiresAt: detail.expiresAt,
            ...(detail.revokedAt === undefined
              ? {}
              : { revokedAt: detail.revokedAt }),
            ...(detail.lastUsedAt === undefined
              ? {}
              : { lastUsedAt: detail.lastUsedAt }),
            ...(detail.lastUsedOutcome === undefined
              ? {}
              : { lastUsedOutcome: detail.lastUsedOutcome }),
          };
          yield* appendAuditEvent(auditLog, {
            requestContext: decoded.requestContext,
            action: adminOperatorTestTokensAuditAction.issued,
            target: summary.id,
            reason: reasonId,
          });
          return {
            summary,
            plaintextToken: encodedToken,
          };
        }
      }
      return yield* Effect.fail(
        new AdminOperatorTestTokensPrefixExhaustedError({ attempts: attempt }),
      );
    });

  const revokeToken: AdminOperatorTestTokensServiceImpl["revokeToken"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeRevokeInput(input);
      const actorId = yield* requireAdminOwner(
        organizationRepository,
        decoded.requestContext,
        "revoke",
      );
      const reasonId = yield* requireReasonGatesAction(
        decoded.reasonCatalogId,
        adminOperatorTestTokensAuditAction.revoked,
        "revoke",
      );
      if (reasonId !== reasonCatalogId.adminOperatorTestTokensRevoke) {
        return yield* Effect.fail(
          new AdminOperatorTestTokensReasonInvalid({
            operation: "revoke",
            providedReasonCatalogId: reasonId,
            expectedAuditAction: adminOperatorTestTokensAuditAction.revoked,
          }),
        );
      }
      const detail = yield* repository.revokeToken({
        id: decoded.id,
        revokedBy: actorId,
        revokedAt: new Date().toISOString(),
      });
      const summary: AdminOperatorTestTokenSummary = {
        id: detail.id,
        tokenPrefix: detail.tokenPrefix,
        label: detail.label,
        issuedBy: detail.issuedBy,
        issuedAt: detail.issuedAt,
        expiresAt: detail.expiresAt,
        ...(detail.revokedAt === undefined
          ? {}
          : { revokedAt: detail.revokedAt }),
        ...(detail.lastUsedAt === undefined
          ? {}
          : { lastUsedAt: detail.lastUsedAt }),
        ...(detail.lastUsedOutcome === undefined
          ? {}
          : { lastUsedOutcome: detail.lastUsedOutcome }),
      };
      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: adminOperatorTestTokensAuditAction.revoked,
        target: summary.id,
        reason: reasonId,
      });
      return { summary };
    });

  const recordVerificationOutcome = (
    requestContext: RequestContext,
    args: {
      readonly tokenId: string;
      readonly outcome: "success" | "failure";
      readonly failureReason?: AdminOperatorTestTokenVerificationFailureReason;
      readonly correlationId: string;
    },
  ) =>
    Effect.gen(function* () {
      yield* repository.recordUsageEvent({
        tokenId: args.tokenId,
        occurredAt: new Date().toISOString(),
        outcome:
          args.outcome === "success"
            ? adminOperatorTestTokenUsageOutcome.success
            : adminOperatorTestTokenUsageOutcome.failure,
        ...(args.failureReason === undefined
          ? {}
          : { failureReason: args.failureReason }),
        correlationId: args.correlationId,
      });
      yield* repository.trimUsageEventsForToken({
        tokenId: args.tokenId,
        keepMostRecent: ADMIN_OPERATOR_TEST_TOKENS_USAGE_RING_LIMIT,
      });
      yield* appendAuditEvent(auditLog, {
        requestContext,
        action:
          args.outcome === "success"
            ? adminOperatorTestTokensAuditAction.usedSuccess
            : adminOperatorTestTokensAuditAction.usedFailure,
        target: args.tokenId,
        reason: reasonCatalogId.adminOperatorTestTokensIssue,
      });
    });

  const verifyToken: AdminOperatorTestTokensServiceImpl["verifyToken"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeVerifyInput(input);
      yield* requireAdminOwner(
        organizationRepository,
        decoded.requestContext,
        "verify",
      );
      // Encoded-form decode at the verify boundary; malformed input
      // bypasses the prefix lookup and records `malformed`.
      const decodeResult = yield* Effect.either(
        decodeEncodedToken(decoded.encodedToken),
      );
      if (decodeResult._tag === "Left") {
        return {
          outcome: "failure" as const,
          failureReason:
            adminOperatorTestTokenVerificationFailureReason.malformed,
        };
      }
      const normalizedToken = decodeResult.right.toLowerCase();
      const tokenPrefix = extractPrefixFromEncoded(normalizedToken);
      const stored = yield* repository.findByPrefix(tokenPrefix);
      if (Option.isNone(stored)) {
        return {
          outcome: "failure" as const,
          failureReason:
            adminOperatorTestTokenVerificationFailureReason.unknown,
        };
      }
      const tokenId = stored.value.summary.id;
      const recomputedHash = yield* computeTokenHmacHex(
        options.signingKey,
        normalizedToken,
      );
      if (!constantTimeStringEqual(recomputedHash, stored.value.tokenHash)) {
        yield* recordVerificationOutcome(decoded.requestContext, {
          tokenId,
          outcome: "failure",
          failureReason:
            adminOperatorTestTokenVerificationFailureReason.mismatch,
          correlationId: decoded.correlationId,
        });
        return {
          outcome: "failure" as const,
          failureReason:
            adminOperatorTestTokenVerificationFailureReason.mismatch,
          tokenId,
        };
      }
      if (stored.value.summary.revokedAt !== undefined) {
        yield* recordVerificationOutcome(decoded.requestContext, {
          tokenId,
          outcome: "failure",
          failureReason:
            adminOperatorTestTokenVerificationFailureReason.revoked,
          correlationId: decoded.correlationId,
        });
        return {
          outcome: "failure" as const,
          failureReason:
            adminOperatorTestTokenVerificationFailureReason.revoked,
          tokenId,
        };
      }
      const expiresAtMs = new Date(stored.value.summary.expiresAt).getTime();
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
        yield* recordVerificationOutcome(decoded.requestContext, {
          tokenId,
          outcome: "failure",
          failureReason:
            adminOperatorTestTokenVerificationFailureReason.expired,
          correlationId: decoded.correlationId,
        });
        return {
          outcome: "failure" as const,
          failureReason:
            adminOperatorTestTokenVerificationFailureReason.expired,
          tokenId,
        };
      }
      yield* recordVerificationOutcome(decoded.requestContext, {
        tokenId,
        outcome: "success",
        correlationId: decoded.correlationId,
      });
      return {
        outcome: "success" as const,
        tokenId,
        summary: stored.value.summary,
      };
    });

  return { list, issueToken, revokeToken, verifyToken };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const makeAdminOperatorTestTokensServiceLayer = (
  options: AdminOperatorTestTokensServiceOptions,
) =>
  Layer.effect(
    AdminOperatorTestTokensService,
    Effect.gen(function* () {
      const repository = yield* AdminOperatorTestTokensRepository;
      const organizationRepository = yield* AdminOrganizationRepository;
      const auditLog = yield* AuditLogModule;
      return makeAdminOperatorTestTokensService(
        repository,
        organizationRepository,
        auditLog,
        options,
      );
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const AdminOperatorTestTokensProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  ADMIN_OPERATOR_TEST_TOKENS_SIGNING_KEY: Schema.NonEmptyString,
  ADMIN_OPERATOR_TEST_TOKENS_DEFAULT_EXPIRY_HOURS: Schema.NonEmptyString,
  ADMIN_OPERATOR_TEST_TOKENS_MAX_EXPIRY_HOURS: Schema.NonEmptyString,
});

const decodeAdminOperatorTestTokensProcessEnvironment = Schema.decodeUnknown(
  AdminOperatorTestTokensProcessEnvironmentSchema,
);

const ExpiryHoursSchema = Schema.compose(
  Schema.NumberFromString,
  Schema.Int.pipe(
    Schema.greaterThanOrEqualTo(1),
    Schema.lessThanOrEqualTo(24 * 365),
  ),
);

const decodeRuntimeConfig = Schema.decodeUnknown(
  AdminOperatorTestTokensRuntimeConfigSchema,
);

export type AdminOperatorTestTokensRuntimeOptions = {
  readonly postgresUrl: string;
  readonly signingKey: string;
  readonly tokenDefaultExpiryHours: number;
  readonly tokenMaxExpiryHours: number;
};

const resolveAdminOperatorTestTokensRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeAdminOperatorTestTokensProcessEnvironment(environment).pipe(
    Effect.flatMap((resolved) =>
      Effect.gen(function* () {
        const defaultExpiry = yield* Schema.decodeUnknown(ExpiryHoursSchema)(
          resolved.ADMIN_OPERATOR_TEST_TOKENS_DEFAULT_EXPIRY_HOURS,
        );
        const maxExpiry = yield* Schema.decodeUnknown(ExpiryHoursSchema)(
          resolved.ADMIN_OPERATOR_TEST_TOKENS_MAX_EXPIRY_HOURS,
        );
        const config = yield* decodeRuntimeConfig({
          signingKey: resolved.ADMIN_OPERATOR_TEST_TOKENS_SIGNING_KEY,
          tokenDefaultExpiryHours: defaultExpiry,
          tokenMaxExpiryHours: maxExpiry,
        });
        const out: AdminOperatorTestTokensRuntimeOptions = {
          postgresUrl: resolved.POSTGRES_URL,
          signingKey: config.signingKey,
          tokenDefaultExpiryHours: config.tokenDefaultExpiryHours,
          tokenMaxExpiryHours: config.tokenMaxExpiryHours,
        };
        return out;
      }),
    ),
  );

const makeAdminOperatorTestTokensRuntime = (
  options: AdminOperatorTestTokensRuntimeOptions,
) =>
  Effect.gen(function* () {
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
    const writeDatabase = buildWriteDatabase(postgres.database);
    const auditLogQueryable: AuditLogPostgresQueryable = {
      listEventsByModule: (moduleId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.moduleId, moduleId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTarget: (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.moduleId, input.moduleId),
              eq(auditLogEventsTable.target, input.target),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByActor: (actorId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.actorId, actorId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTenant: (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.tenantScope, input.tenantScope),
              eq(auditLogEventsTable.tenantScopeId, input.tenantScopeId),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
    };
    const auditLogRepository = yield* makeAuditLogPostgresRepository({
      ...writeDatabase,
      ...auditLogQueryable,
    });
    const auditLog = yield* makeAuditLogModule(auditLogRepository);
    const baseLayer = Layer.mergeAll(
      makeAdminOperatorTestTokensRepositoryLayer(writeDatabase),
      makeAdminOrganizationRepositoryLayer(writeDatabase),
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
    );
    const serviceLayer = makeAdminOperatorTestTokensServiceLayer({
      signingKey: options.signingKey,
      maxExpiryHours: options.tokenMaxExpiryHours,
    }).pipe(Layer.provide(baseLayer));
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type AdminOperatorTestTokensRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError;

export const runAdminOperatorTestTokensFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: AdminOperatorTestTokensServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | AdminOperatorTestTokensRuntimeError> =>
  resolveAdminOperatorTestTokensRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeAdminOperatorTestTokensRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(AdminOperatorTestTokensService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  );
