import { Effect } from "effect";
import {
  listAdminOrganizationMembersFromEnvironment,
  listAdminWorkspacesFromEnvironment,
  listMembersFromEnvironment,
  listWorkspacesFromEnvironment,
  queryAdminOrganizationScopedAuditEventsFromSessionId,
} from "@comvestec/platform";
import { platformModuleId } from "@comvestec/contracts";

/**
 * Phase 7a-1 admin-app helper coverage:
 *   - canonical aliases (`listAdminOrganization*FromEnvironment`)
 *     stay reference-equal to the underlying access-concern helpers
 *     so admin-app consumers can call either name without a stale
 *     re-export hop.
 *   - the new admin-org-scoped audit feed pins the module id to
 *     `platformModuleId.adminOrganization` regardless of caller
 *     input, forwards the sessionId untouched, propagates the typed
 *     success and failure channels through the `*FromSessionId`
 *     dependency-injection seam, and tolerates an empty audit
 *     stream.
 */
describe("admin-app admin-org helpers (Phase 7a-1)", () => {
  it("re-exports listAdminOrganizationMembersFromEnvironment as an alias of listMembersFromEnvironment", () => {
    expect(listAdminOrganizationMembersFromEnvironment).toBe(
      listMembersFromEnvironment,
    );
  });

  it("re-exports listAdminWorkspacesFromEnvironment as an alias of listWorkspacesFromEnvironment", () => {
    expect(listAdminWorkspacesFromEnvironment).toBe(
      listWorkspacesFromEnvironment,
    );
  });

  it("pins the audit query to platformModuleId.adminOrganization through the injected delegate", async () => {
    const request: Parameters<
      typeof queryAdminOrganizationScopedAuditEventsFromSessionId
    >[1] = {
      sessionId: "sess_admin_org_audit",
    };
    const expected = [] as const;
    const queryAuditEventsByModule: NonNullable<
      Parameters<typeof queryAdminOrganizationScopedAuditEventsFromSessionId>[2]
    > = vi.fn(() => Effect.succeed(expected));

    await expect(
      Effect.runPromise(
        queryAdminOrganizationScopedAuditEventsFromSessionId(
          {},
          request,
          queryAuditEventsByModule,
        ),
      ),
    ).resolves.toBe(expected);

    expect(queryAuditEventsByModule).toHaveBeenCalledWith({
      sessionId: request.sessionId,
      moduleId: platformModuleId.adminOrganization,
    });
  });

  it("forwards the operator sessionId verbatim to the underlying audit query", async () => {
    const sessionId = "sess_break_glass_admin_org";
    const queryAuditEventsByModule: NonNullable<
      Parameters<typeof queryAdminOrganizationScopedAuditEventsFromSessionId>[2]
    > = vi.fn(() => Effect.succeed([] as const));

    await Effect.runPromise(
      queryAdminOrganizationScopedAuditEventsFromSessionId(
        {},
        { sessionId },
        queryAuditEventsByModule,
      ),
    );

    expect(queryAuditEventsByModule).toHaveBeenCalledTimes(1);
    const [callArg] =
      (
        queryAuditEventsByModule as unknown as {
          mock: { calls: ReadonlyArray<ReadonlyArray<{ sessionId: string }>> };
        }
      ).mock.calls[0] ?? [];
    expect(callArg?.sessionId).toBe(sessionId);
  });

  it("returns the underlying audit event collection when the delegate succeeds with a populated feed", async () => {
    const expected = [
      {
        eventId: "audit_evt_admin_org_invite",
        timestamp: "2026-05-14T14:00:00.000Z",
        actorId: "usr_platform_operator",
        moduleId: platformModuleId.adminOrganization,
        action: "admin-organization.member-invited",
        target: "admin-organization:member:usr_audit_operator",
        reason: "Phase 7 fixture audit row",
        tenantScope: "platform",
        tenantScopeId: "platform",
      },
    ] as const;
    const queryAuditEventsByModule: NonNullable<
      Parameters<typeof queryAdminOrganizationScopedAuditEventsFromSessionId>[2]
    > = vi.fn(
      () =>
        Effect.succeed(expected) as unknown as ReturnType<
          NonNullable<
            Parameters<
              typeof queryAdminOrganizationScopedAuditEventsFromSessionId
            >[2]
          >
        >,
    );

    await expect(
      Effect.runPromise(
        queryAdminOrganizationScopedAuditEventsFromSessionId(
          {},
          { sessionId: "sess_admin_org_audit_populated" },
          queryAuditEventsByModule,
        ),
      ),
    ).resolves.toBe(expected);
  });

  it("propagates a typed failure channel from the delegate untouched", async () => {
    class AdminOrgAuditDelegateError {
      readonly _tag = "AdminOrgAuditDelegateError" as const;
    }
    const failure = new AdminOrgAuditDelegateError();
    const queryAuditEventsByModule: NonNullable<
      Parameters<typeof queryAdminOrganizationScopedAuditEventsFromSessionId>[2]
    > = vi.fn(
      () =>
        Effect.fail(failure) as unknown as ReturnType<
          NonNullable<
            Parameters<
              typeof queryAdminOrganizationScopedAuditEventsFromSessionId
            >[2]
          >
        >,
    );

    await expect(
      Effect.runPromise(
        queryAdminOrganizationScopedAuditEventsFromSessionId(
          {},
          { sessionId: "sess_admin_org_audit_failure" },
          queryAuditEventsByModule,
        ),
      ),
    ).rejects.toThrow();
  });

  it("tolerates an empty audit feed without dropping the pinned module id", async () => {
    const queryAuditEventsByModule: NonNullable<
      Parameters<typeof queryAdminOrganizationScopedAuditEventsFromSessionId>[2]
    > = vi.fn(() => Effect.succeed([] as const));

    const result = await Effect.runPromise(
      queryAdminOrganizationScopedAuditEventsFromSessionId(
        {},
        { sessionId: "sess_admin_org_audit_empty" },
        queryAuditEventsByModule,
      ),
    );

    expect(result).toEqual([]);
    expect(queryAuditEventsByModule).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: platformModuleId.adminOrganization,
      }),
    );
  });
});
