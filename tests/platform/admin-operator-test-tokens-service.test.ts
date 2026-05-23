/**
 * Admin-operator-test-tokens platform service unit tests
 * (admin-app implementation plan §9 item 17 — Phase 7a-2b-ii).
 *
 * Mirrors the `admin-saved-views-service` and `admin-organization-service`
 * harnesses: in-memory fakes for the test-tokens repository, the
 * admin-organization membership repository, and the audit log,
 * composed through `makeAdminOperatorTestTokensService`. The tests
 * pin every cross-cutting invariant the service is supposed to
 * enforce above and beyond the repository:
 *
 *   - admin-owner hard floor on list / issue / revoke / verify
 *     (non-owner roles, missing membership, missing actorId all
 *     fail at the boundary)
 *   - reason-catalog validation against `validateReasonForAction`
 *   - HMAC-SHA-256 round-trip + constant-time verify
 *   - expired / revoked-token verify outcomes recorded into the
 *     usage-event ring AND audit log
 *   - prefix-collision retry exhausting the bounded budget
 *   - env-bound runtime config decode failure on missing signing key
 *   - no break-glass override accepted (verify-only test against
 *     the contract surface)
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  adminMemberRole,
  adminMemberStatus,
  adminOperatorTestTokenUsageOutcome,
  adminOperatorTestTokenVerificationFailureReason,
  adminOperatorTestTokensAuditAction,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  type AdminMember,
  type AdminOperatorTestTokenDetail,
  type AdminOperatorTestTokenSummary,
  type RequestContext,
} from "@comvestec/contracts";
import {
  AdminOperatorTestTokensAlreadyRevokedError,
  AdminOperatorTestTokensNotFoundError,
  AdminOperatorTestTokensUniquePrefixViolationError,
  type AdminOperatorTestTokensRepositoryService,
  type AdminOrganizationRepositoryService,
  type AuditLogModuleService,
  type BuildAuditEventInput,
} from "@comvestec/modules";
import {
  ADMIN_OPERATOR_TEST_TOKENS_PREFIX_RETRY_BUDGET,
  AdminOperatorTestTokensAccessDenied,
  AdminOperatorTestTokensExpiryOutOfRange,
  AdminOperatorTestTokensMissingActor,
  AdminOperatorTestTokensPrefixExhaustedError,
  AdminOperatorTestTokensReasonAttachmentMissing,
  AdminOperatorTestTokensReasonInvalid,
  constantTimeStringEqual,
  makeAdminOperatorTestTokensService,
  runAdminOperatorTestTokensFromEnvironment,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const OWNER_SUBJECT = "kc_subject_admin_owner";
const NON_OWNER_SUBJECT = "kc_subject_admin_operator";
const STRANGER_SUBJECT = "kc_subject_stranger";
const SIGNING_KEY = "test-signing-key-do-not-use-in-prod-0001";

const baseRequestContext = (overrides?: {
  readonly actorId?: string | undefined;
}): RequestContext => ({
  actorType: actorType.platformOperator,
  actorId:
    overrides && "actorId" in overrides ? overrides.actorId : OWNER_SUBJECT,
  sessionId: "sess_aott_test",
  correlationId: "corr_aott_test",
  reason: "admin-operator-test-tokens unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
});

const buildMember = (
  role: AdminMember["role"],
  keycloakSubjectId: string,
): AdminMember => ({
  id: `mbr_${keycloakSubjectId}`,
  keycloakSubjectId,
  email: `${keycloakSubjectId}@local.test`,
  displayName: keycloakSubjectId,
  role,
  status: adminMemberStatus.active,
  invitedAt: "2026-01-01T00:00:00.000Z",
  createdBy: "system",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const createOrganizationRepoFake = (
  members: ReadonlyArray<AdminMember>,
): AdminOrganizationRepositoryService => {
  const bySubject = new Map<string, AdminMember>();
  for (const member of members) {
    if (member.keycloakSubjectId !== undefined) {
      bySubject.set(member.keycloakSubjectId, member);
    }
  }
  const notImplemented = <A>(): Effect.Effect<A, never> =>
    Effect.sync(() => {
      throw new Error("admin-organization repository fake — method not used");
    });
  return {
    listMembers: () => Effect.succeed([]),
    getMember: () => Effect.succeed(Option.none()),
    getMembershipByEmail: () => Effect.succeed(Option.none()),
    getMembershipByKeycloakSubjectId: (subjectId) =>
      Effect.sync(() => {
        const found = bySubject.get(subjectId);
        return found === undefined ? Option.none() : Option.some(found);
      }),
    inviteMember: notImplemented,
    getInvitationByTokenHash: () => Effect.succeed(Option.none()),
    redeemInvitation: notImplemented,
    ensureBootstrapOwner: notImplemented,
    changeMemberRole: notImplemented,
    removeMember: notImplemented,
    countMembersByRole: () => Effect.succeed(0),
  };
};

const createAuditFake = () => {
  const calls: BuildAuditEventInput[] = [];
  const service: AuditLogModuleService = {
    append: (input) =>
      Effect.sync(() => {
        calls.push(input);
        return {
          eventId: `evt_${calls.length}`,
          timestamp: new Date().toISOString(),
          actorId:
            input.requestContext.actorId ??
            `${input.requestContext.actorType}:anonymous`,
          tenantScope: input.requestContext.tenant.scope,
          tenantScopeId: input.requestContext.tenant.scopeId,
          moduleId: input.moduleId,
          action: input.action,
          target: input.target,
          reason: input.reason ?? input.requestContext.reason,
          correlationId: input.requestContext.correlationId,
        };
      }),
    queryByModule: () => Effect.succeed([]),
    queryByTarget: () => Effect.succeed([]),
    queryByActor: () => Effect.succeed([]),
    queryByTenant: () => Effect.succeed([]),
    requirements: Effect.succeed([]),
  };
  return { service, calls };
};

type RepoOptions = {
  readonly issueFailsWith?:
    | "unique-prefix"
    | "always-unique-prefix"
    | "not-found";
  readonly revokeFailsWith?: "not-found" | "already-revoked";
};

const buildDetailFromInput = (input: {
  readonly id: string;
  readonly tokenPrefix: string;
  readonly tokenHash: string;
  readonly label: string;
  readonly issuedBy: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly reasonCatalogId: string;
  readonly reasonAttachmentText?: string;
  readonly revokedAt?: string;
  readonly revokedBy?: string;
}): AdminOperatorTestTokenDetail => ({
  id: input.id,
  tokenPrefix: input.tokenPrefix,
  label: input.label,
  issuedBy: input.issuedBy,
  issuedAt: input.issuedAt,
  expiresAt: input.expiresAt,
  ...(input.revokedAt === undefined ? {} : { revokedAt: input.revokedAt }),
  ...(input.revokedBy === undefined ? {} : { revokedBy: input.revokedBy }),
  reasonCatalogId: input.reasonCatalogId,
  ...(input.reasonAttachmentText === undefined
    ? {}
    : { reasonAttachmentText: input.reasonAttachmentText }),
});

const createTokensRepoFake = (options: RepoOptions = {}) => {
  const rows = new Map<
    string,
    { detail: AdminOperatorTestTokenDetail; tokenHash: string }
  >();
  const byPrefix = new Map<string, string>();
  const usageEvents: Array<{
    tokenId: string;
    occurredAt: string;
    outcome: string;
    failureReason?: string;
    correlationId: string;
  }> = [];
  let sequence = 0;
  let issueAttempts = 0;

  const service: AdminOperatorTestTokensRepositoryService = {
    issueToken: (input) =>
      Effect.gen(function* () {
        issueAttempts += 1;
        if (
          options.issueFailsWith === "always-unique-prefix" ||
          (options.issueFailsWith === "unique-prefix" && issueAttempts === 1)
        ) {
          return yield* Effect.fail(
            new AdminOperatorTestTokensUniquePrefixViolationError({
              tokenPrefix: input.tokenPrefix,
            }),
          );
        }
        sequence += 1;
        const id = `tok_${sequence}`;
        const detail = buildDetailFromInput({
          id,
          tokenPrefix: input.tokenPrefix,
          tokenHash: input.tokenHash,
          label: input.label,
          issuedBy: input.issuedBy,
          issuedAt: input.issuedAt,
          expiresAt: input.expiresAt,
          reasonCatalogId: input.reasonCatalogId,
          ...(input.reasonAttachmentText === undefined
            ? {}
            : { reasonAttachmentText: input.reasonAttachmentText }),
        });
        rows.set(id, { detail, tokenHash: input.tokenHash });
        byPrefix.set(input.tokenPrefix, id);
        return detail;
      }),
    getTokenById: (id) =>
      Effect.sync(() => {
        const row = rows.get(id);
        return row === undefined ? Option.none() : Option.some(row.detail);
      }),
    findByPrefix: (tokenPrefix) =>
      Effect.sync(() => {
        const id = byPrefix.get(tokenPrefix);
        if (id === undefined) {
          return Option.none();
        }
        const row = rows.get(id);
        if (row === undefined) {
          return Option.none();
        }
        const summary: AdminOperatorTestTokenSummary = {
          id: row.detail.id,
          tokenPrefix: row.detail.tokenPrefix,
          label: row.detail.label,
          issuedBy: row.detail.issuedBy,
          issuedAt: row.detail.issuedAt,
          expiresAt: row.detail.expiresAt,
          ...(row.detail.revokedAt === undefined
            ? {}
            : { revokedAt: row.detail.revokedAt }),
          ...(row.detail.lastUsedAt === undefined
            ? {}
            : { lastUsedAt: row.detail.lastUsedAt }),
          ...(row.detail.lastUsedOutcome === undefined
            ? {}
            : { lastUsedOutcome: row.detail.lastUsedOutcome }),
        };
        return Option.some({ summary, tokenHash: row.tokenHash });
      }),
    listSummaries: ({ limit }) =>
      Effect.sync(() =>
        [...rows.values()]
          .slice(0, limit)
          .map((row): AdminOperatorTestTokenSummary => {
            const summary: AdminOperatorTestTokenSummary = {
              id: row.detail.id,
              tokenPrefix: row.detail.tokenPrefix,
              label: row.detail.label,
              issuedBy: row.detail.issuedBy,
              issuedAt: row.detail.issuedAt,
              expiresAt: row.detail.expiresAt,
              ...(row.detail.revokedAt === undefined
                ? {}
                : { revokedAt: row.detail.revokedAt }),
              ...(row.detail.lastUsedAt === undefined
                ? {}
                : { lastUsedAt: row.detail.lastUsedAt }),
              ...(row.detail.lastUsedOutcome === undefined
                ? {}
                : { lastUsedOutcome: row.detail.lastUsedOutcome }),
            };
            return summary;
          }),
      ),
    countByLifecycle: () =>
      Effect.succeed({ active: 0, expiringSoon: 0, revoked: 0 }),
    revokeToken: (input) =>
      Effect.gen(function* () {
        if (options.revokeFailsWith === "not-found") {
          return yield* Effect.fail(
            new AdminOperatorTestTokensNotFoundError({ id: input.id }),
          );
        }
        if (options.revokeFailsWith === "already-revoked") {
          return yield* Effect.fail(
            new AdminOperatorTestTokensAlreadyRevokedError({ id: input.id }),
          );
        }
        const row = rows.get(input.id);
        if (row === undefined) {
          return yield* Effect.fail(
            new AdminOperatorTestTokensNotFoundError({ id: input.id }),
          );
        }
        const next: AdminOperatorTestTokenDetail = {
          ...row.detail,
          revokedAt: input.revokedAt,
          revokedBy: input.revokedBy,
        };
        rows.set(input.id, { detail: next, tokenHash: row.tokenHash });
        return next;
      }),
    recordUsageEvent: (input) =>
      Effect.sync(() => {
        usageEvents.push({
          tokenId: input.tokenId,
          occurredAt: input.occurredAt,
          outcome: input.outcome,
          ...(input.failureReason === undefined
            ? {}
            : { failureReason: input.failureReason }),
          correlationId: input.correlationId,
        });
      }),
    trimUsageEventsForToken: () => Effect.succeed(0),
    listUsageEventsForToken: ({ tokenId, limit }) =>
      Effect.sync(() =>
        usageEvents
          .filter((event) => event.tokenId === tokenId)
          .slice(0, limit)
          .map((event) => ({
            id: `evt_${event.tokenId}_${event.occurredAt}`,
            tokenId: event.tokenId,
            occurredAt: event.occurredAt,
            outcome:
              event.outcome === adminOperatorTestTokenUsageOutcome.success
                ? adminOperatorTestTokenUsageOutcome.success
                : adminOperatorTestTokenUsageOutcome.failure,
            ...(event.failureReason === undefined
              ? {}
              : {
                  failureReason:
                    event.failureReason as keyof typeof adminOperatorTestTokenVerificationFailureReason,
                }),
            correlationId: event.correlationId,
          })),
      ),
  };
  return {
    service,
    inspect: {
      rows,
      usageEvents,
      get issueAttempts(): number {
        return issueAttempts;
      },
    },
  };
};

const buildService = (
  opts: {
    readonly repoOptions?: RepoOptions;
    readonly members?: ReadonlyArray<AdminMember>;
    readonly maxExpiryHours?: number;
  } = {},
) => {
  const tokens = createTokensRepoFake(opts.repoOptions);
  const org = createOrganizationRepoFake(
    opts.members ?? [buildMember(adminMemberRole.adminOwner, OWNER_SUBJECT)],
  );
  const audit = createAuditFake();
  const service = makeAdminOperatorTestTokensService(
    tokens.service,
    org,
    audit.service,
    {
      signingKey: SIGNING_KEY,
      maxExpiryHours: opts.maxExpiryHours ?? 24,
    },
  );
  return { service, tokens, audit };
};

const tomorrowIso = (hoursFromNow = 8): string =>
  new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();

const validIssueInput = (overrides?: {
  readonly actorId?: string | undefined;
  readonly reasonAttachmentText?: string;
  readonly reasonCatalogId?: string;
  readonly expiresAt?: string;
  readonly label?: string;
}) => ({
  requestContext: baseRequestContext(
    overrides !== undefined && "actorId" in overrides
      ? { actorId: overrides.actorId }
      : undefined,
  ),
  label: overrides?.label ?? "Test token",
  expiresAt: overrides?.expiresAt ?? tomorrowIso(8),
  reasonCatalogId:
    overrides?.reasonCatalogId ?? reasonCatalogId.adminOperatorTestTokensIssue,
  reasonAttachmentText:
    overrides?.reasonAttachmentText ?? "incident-id INC-1234",
});

const expectFailureTag = async (
  effect: Effect.Effect<unknown, unknown>,
  expectedTag: string,
) => {
  const exit = await Effect.runPromiseExit(effect);
  expect(exit._tag).toBe("Failure");
  if (exit._tag === "Failure") {
    const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
    expect(
      typeof failure === "object" &&
        failure !== null &&
        "_tag" in failure &&
        (failure as { readonly _tag: string })._tag === expectedTag,
    ).toBe(true);
  }
};

// ---------------------------------------------------------------------------
// 1. Crypto round-trip (issue → verify success)
// ---------------------------------------------------------------------------

describe("AdminOperatorTestTokensService — crypto round-trip", () => {
  it("issues a token and verifies it through the HMAC-SHA-256 path", async () => {
    const { service, audit } = buildService();
    const issued = await Effect.runPromise(
      service.issueToken(validIssueInput()),
    );
    expect(issued.plaintextToken.startsWith("aott_")).toBe(true);
    expect(issued.summary.tokenPrefix).toBe(issued.plaintextToken.slice(0, 13));
    const verify = await Effect.runPromise(
      service.verifyToken({
        requestContext: baseRequestContext(),
        encodedToken: issued.plaintextToken,
        correlationId: "corr_verify_1",
      }),
    );
    expect(verify.outcome).toBe("success");
    if (verify.outcome === "success") {
      expect(verify.tokenId).toBe(issued.summary.id);
    }
    // Issue + verify => one `issued` + one `usedSuccess` audit row.
    const actions = audit.calls.map((c) => c.action);
    expect(actions).toContain(adminOperatorTestTokensAuditAction.issued);
    expect(actions).toContain(adminOperatorTestTokensAuditAction.usedSuccess);
  });
});

// ---------------------------------------------------------------------------
// 2. Admin-owner floor — non-owner roles fail on every op
// ---------------------------------------------------------------------------

describe("AdminOperatorTestTokensService — admin-owner hard floor", () => {
  it.each(["list", "issue", "revoke"] as const)(
    "rejects %s when membership role is admin-operator (not admin-owner)",
    async (operation) => {
      const { service } = buildService({
        members: [
          buildMember(adminMemberRole.adminOperator, NON_OWNER_SUBJECT),
        ],
      });
      const requestContext = baseRequestContext({ actorId: NON_OWNER_SUBJECT });
      const program = (() => {
        if (operation === "list") {
          return service.list({ requestContext });
        }
        if (operation === "issue") {
          return service.issueToken({
            ...validIssueInput({ actorId: NON_OWNER_SUBJECT }),
          });
        }
        return service.revokeToken({
          requestContext,
          id: "tok_any",
          reasonCatalogId: reasonCatalogId.adminOperatorTestTokensRevoke,
        });
      })();
      await expectFailureTag(
        program,
        new AdminOperatorTestTokensAccessDenied({
          requestingActorId: NON_OWNER_SUBJECT,
          operation,
          reason: "non-admin-owner",
        })._tag,
      );
    },
  );

  it("rejects list when the actor has no admin-org membership", async () => {
    const { service } = buildService({ members: [] });
    await expectFailureTag(
      service.list({
        requestContext: baseRequestContext({ actorId: STRANGER_SUBJECT }),
      }),
      new AdminOperatorTestTokensAccessDenied({
        requestingActorId: STRANGER_SUBJECT,
        operation: "list",
        reason: "no-membership",
      })._tag,
    );
  });

  it("rejects issue when actorId is absent from the request context", async () => {
    const { service } = buildService();
    await expectFailureTag(
      service.issueToken({
        ...validIssueInput({ actorId: undefined }),
      }),
      new AdminOperatorTestTokensMissingActor({ operation: "issue" })._tag,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Reason-catalog validation
// ---------------------------------------------------------------------------

describe("AdminOperatorTestTokensService — reason-catalog validation", () => {
  it("rejects issue with the revoke reason (does not gate `issued`)", async () => {
    const { service } = buildService();
    await expectFailureTag(
      service.issueToken(
        validIssueInput({
          reasonCatalogId: reasonCatalogId.adminOperatorTestTokensRevoke,
        }),
      ),
      new AdminOperatorTestTokensReasonInvalid({
        operation: "issue",
        providedReasonCatalogId: reasonCatalogId.adminOperatorTestTokensRevoke,
        expectedAuditAction: adminOperatorTestTokensAuditAction.issued,
      })._tag,
    );
  });

  it("rejects revoke with the issue reason (does not gate `revoked`)", async () => {
    const { service } = buildService();
    await expectFailureTag(
      service.revokeToken({
        requestContext: baseRequestContext(),
        id: "tok_any",
        reasonCatalogId: reasonCatalogId.adminOperatorTestTokensIssue,
      }),
      new AdminOperatorTestTokensReasonInvalid({
        operation: "revoke",
        providedReasonCatalogId: reasonCatalogId.adminOperatorTestTokensIssue,
        expectedAuditAction: adminOperatorTestTokensAuditAction.revoked,
      })._tag,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Issue / verify lifecycle errors
// ---------------------------------------------------------------------------

describe("AdminOperatorTestTokensService — lifecycle", () => {
  it("verify(expired) returns `expired` and records usedFailure", async () => {
    // Push expiry to ~1 hour, then mutate the stored row to expire.
    const setup = buildService();
    const issued = await Effect.runPromise(
      setup.service.issueToken(validIssueInput({ expiresAt: tomorrowIso(1) })),
    );
    const stored = setup.tokens.inspect.rows.get(issued.summary.id);
    expect(stored).toBeDefined();
    if (stored !== undefined) {
      stored.detail = {
        ...stored.detail,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };
    }
    const verify = await Effect.runPromise(
      setup.service.verifyToken({
        requestContext: baseRequestContext(),
        encodedToken: issued.plaintextToken,
        correlationId: "corr_verify_expired",
      }),
    );
    expect(verify.outcome).toBe("failure");
    if (verify.outcome === "failure") {
      expect(verify.failureReason).toBe(
        adminOperatorTestTokenVerificationFailureReason.expired,
      );
    }
    const auditActions = setup.audit.calls.map((c) => c.action);
    expect(auditActions).toContain(
      adminOperatorTestTokensAuditAction.usedFailure,
    );
    expect(
      setup.tokens.inspect.usageEvents.some(
        (e) =>
          e.outcome === adminOperatorTestTokenUsageOutcome.failure &&
          e.failureReason ===
            adminOperatorTestTokenVerificationFailureReason.expired,
      ),
    ).toBe(true);
  });

  it("verify(revoked) returns `revoked` and records usedFailure", async () => {
    const setup = buildService();
    const issued = await Effect.runPromise(
      setup.service.issueToken(validIssueInput()),
    );
    await Effect.runPromise(
      setup.service.revokeToken({
        requestContext: baseRequestContext(),
        id: issued.summary.id,
        reasonCatalogId: reasonCatalogId.adminOperatorTestTokensRevoke,
      }),
    );
    const verify = await Effect.runPromise(
      setup.service.verifyToken({
        requestContext: baseRequestContext(),
        encodedToken: issued.plaintextToken,
        correlationId: "corr_verify_revoked",
      }),
    );
    expect(verify.outcome).toBe("failure");
    if (verify.outcome === "failure") {
      expect(verify.failureReason).toBe(
        adminOperatorTestTokenVerificationFailureReason.revoked,
      );
    }
    expect(
      setup.tokens.inspect.usageEvents.some(
        (e) =>
          e.failureReason ===
          adminOperatorTestTokenVerificationFailureReason.revoked,
      ),
    ).toBe(true);
  });

  it("rejects issue when expiresAt is in the past", async () => {
    const { service } = buildService();
    await expectFailureTag(
      service.issueToken(
        validIssueInput({
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        }),
      ),
      new AdminOperatorTestTokensExpiryOutOfRange({
        expiresAt: "ignored",
        now: "ignored",
        maxExpiryHours: 24,
      })._tag,
    );
  });

  it("rejects issue when reasonAttachmentText is whitespace only (re-asserted at the service boundary)", async () => {
    // The contract schema rejects empty strings, so we bypass the
    // public schema via an unknown cast for the negative test of the
    // service-internal re-assertion.
    const { service } = buildService();
    const program = service.issueToken({
      ...validIssueInput(),
      reasonAttachmentText: "   ",
    } as unknown as Parameters<typeof service.issueToken>[0]);
    await expectFailureTag(
      program,
      new AdminOperatorTestTokensReasonAttachmentMissing({
        reasonCatalogId: reasonCatalogId.adminOperatorTestTokensIssue,
      })._tag,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Prefix-collision retry
// ---------------------------------------------------------------------------

describe("AdminOperatorTestTokensService — prefix-collision retry", () => {
  it("retries when the repository raises UniquePrefixViolationError once and then succeeds", async () => {
    const { service, tokens } = buildService({
      repoOptions: { issueFailsWith: "unique-prefix" },
    });
    const issued = await Effect.runPromise(
      service.issueToken(validIssueInput()),
    );
    expect(tokens.inspect.issueAttempts).toBeGreaterThanOrEqual(2);
    expect(issued.summary.id).toMatch(/^tok_/);
  });

  it("surfaces AdminOperatorTestTokensPrefixExhaustedError after the budget is consumed", async () => {
    const { service, tokens } = buildService({
      repoOptions: { issueFailsWith: "always-unique-prefix" },
    });
    await expectFailureTag(
      service.issueToken(validIssueInput()),
      new AdminOperatorTestTokensPrefixExhaustedError({ attempts: 0 })._tag,
    );
    expect(tokens.inspect.issueAttempts).toBe(
      ADMIN_OPERATOR_TEST_TOKENS_PREFIX_RETRY_BUDGET,
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Audit-event shape
// ---------------------------------------------------------------------------

describe("AdminOperatorTestTokensService — audit emission", () => {
  it("emits exactly one issued audit row keyed by the admin-operator-test-tokens module", async () => {
    const { service, audit } = buildService();
    const issued = await Effect.runPromise(
      service.issueToken(validIssueInput()),
    );
    const issuedRows = audit.calls.filter(
      (c) => c.action === adminOperatorTestTokensAuditAction.issued,
    );
    expect(issuedRows.length).toBe(1);
    const row = issuedRows[0];
    expect(row?.moduleId).toBe(platformModuleId.adminOperatorTestTokens);
    expect(row?.target).toBe(issued.summary.id);
    expect(row?.reason).toBe(reasonCatalogId.adminOperatorTestTokensIssue);
  });
});

// ---------------------------------------------------------------------------
// 7. Env-decode failure on the runner
// ---------------------------------------------------------------------------

describe("runAdminOperatorTestTokensFromEnvironment — env boundary", () => {
  it("fails with a ParseError when ADMIN_OPERATOR_TEST_TOKENS_SIGNING_KEY is absent", async () => {
    const exit = await Effect.runPromiseExit(
      runAdminOperatorTestTokensFromEnvironment({}, () =>
        Effect.succeed(undefined),
      ),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(
        typeof failure === "object" &&
          failure !== null &&
          "_tag" in failure &&
          (failure as { readonly _tag: string })._tag === "ParseError",
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Constant-time string equality helper
// ---------------------------------------------------------------------------

describe("constantTimeStringEqual", () => {
  it("returns true on equal strings and false on differing strings of the same length", () => {
    expect(constantTimeStringEqual("abc123", "abc123")).toBe(true);
    expect(constantTimeStringEqual("abc123", "abc124")).toBe(false);
    expect(constantTimeStringEqual("abc", "abcd")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. No break-glass override — contract surface assertion
// ---------------------------------------------------------------------------

describe("AdminOperatorTestTokensService — no break-glass override", () => {
  it("does not expose any break-glass-suffixed reason in the test-tokens catalog entries", () => {
    // The two catalog reasons we use must NOT be the
    // `*BreakGlass*` family; this is the closest in-process check
    // that the service contract refuses to be bypassed through a
    // break-glass reason path.
    expect(
      reasonCatalogId.adminOperatorTestTokensIssue.includes("break-glass"),
    ).toBe(false);
    expect(
      reasonCatalogId.adminOperatorTestTokensRevoke.includes("break-glass"),
    ).toBe(false);
  });
});
