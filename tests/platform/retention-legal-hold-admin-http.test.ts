import { Effect } from "effect";
import {
  adminRetentionLegalHoldApiPath,
  createAdminRetentionLegalHoldHttpHandler,
  subscriberJourneySessionHeaderName,
  type RetentionLegalHoldService,
} from "@comvestec/platform";
import {
  retentionDataType,
  retentionLegalHoldStatus,
} from "@comvestec/contracts";

const unexpectedRetentionLegalHoldServiceEffect = <A>() =>
  Effect.die(new Error("Unexpected retention legal hold service call."));

const createRetentionLegalHoldServiceDouble = (
  overrides: Partial<RetentionLegalHoldService>,
): RetentionLegalHoldService => ({
  resolveRequestContext:
    overrides.resolveRequestContext ??
    (() => unexpectedRetentionLegalHoldServiceEffect()),
  upsertRetentionPolicy:
    overrides.upsertRetentionPolicy ??
    (() => unexpectedRetentionLegalHoldServiceEffect()),
  listRetentionPolicies:
    overrides.listRetentionPolicies ??
    (() => unexpectedRetentionLegalHoldServiceEffect()),
  placeRetentionLegalHold:
    overrides.placeRetentionLegalHold ??
    (() => unexpectedRetentionLegalHoldServiceEffect()),
  releaseRetentionLegalHold:
    overrides.releaseRetentionLegalHold ??
    (() => unexpectedRetentionLegalHoldServiceEffect()),
  listRetentionLegalHolds:
    overrides.listRetentionLegalHolds ??
    (() => unexpectedRetentionLegalHoldServiceEffect()),
});

const createTestHandler = (service: Partial<RetentionLegalHoldService>) =>
  createAdminRetentionLegalHoldHttpHandler((use) =>
    use(createRetentionLegalHoldServiceDouble(service)),
  );

describe("platform retention legal hold admin http", () => {
  it("does not trust body session ids when the trusted header is missing", async () => {
    const listRetentionPolicies = vi.fn(() =>
      unexpectedRetentionLegalHoldServiceEffect(),
    );
    const handler = createTestHandler({
      listRetentionPolicies,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminRetentionLegalHoldApiPath.listPolicies}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionId: "sess_body_only_retention",
              scope: "organization",
              scopeId: "org_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authenticated operator session is required.",
    });
    expect(listRetentionPolicies).not.toHaveBeenCalled();
  });

  it("upserts retention policies through the admin governance surface", async () => {
    const handler = createTestHandler({
      upsertRetentionPolicy: () =>
        Effect.succeed({
          policyId: "retention-policy:organization:org_1:file-object",
          dataType: retentionDataType.fileObject,
          retentionDays: 365,
          legalHoldActive: false,
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminRetentionLegalHoldApiPath.upsertPolicy}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_1",
              scope: "organization",
              scopeId: "org_1",
              dataType: retentionDataType.fileObject,
              retentionDays: 365,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        policyId: "retention-policy:organization:org_1:file-object",
      }),
    );
  });

  it("lists legal holds through the admin governance surface", async () => {
    const handler = createTestHandler({
      listRetentionLegalHolds: () =>
        Effect.succeed([
          {
            legalHoldId: "retention-legal-hold:organization:org_1:1",
            dataType: retentionDataType.fileObject,
            targetId: "file_1",
            status: retentionLegalHoldStatus.active,
            placedAt: "2026-04-27T19:00:00.000Z",
            evidence: "case-42",
            legalHoldActive: true,
          },
        ]),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminRetentionLegalHoldApiPath.listLegalHolds}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_1",
              scope: "organization",
              scopeId: "org_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        legalHoldId: "retention-legal-hold:organization:org_1:1",
      }),
    ]);
  });

  it("returns 403 when retention access is denied", async () => {
    const handler = createTestHandler({
      listRetentionPolicies: () =>
        Effect.fail({
          _tag: "RetentionLegalHoldAccessDeniedError",
          actorType: "organization-member",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminRetentionLegalHoldApiPath.listPolicies}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_member_1",
            },
            body: JSON.stringify({
              sessionId: "sess_member_1",
              scope: "organization",
              scopeId: "org_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Retention management is not allowed for this session.",
    });
  });

  it("returns 409 when a legal hold already exists", async () => {
    const handler = createTestHandler({
      placeRetentionLegalHold: () =>
        Effect.fail({
          _tag: "RetentionLegalHoldAlreadyExistsError",
          scope: "organization",
          scopeId: "org_1",
          dataType: retentionDataType.fileObject,
          targetId: "file_1",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminRetentionLegalHoldApiPath.placeLegalHold}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_1",
              scope: "organization",
              scopeId: "org_1",
              dataType: retentionDataType.fileObject,
              targetId: "file_1",
              reason: "Compliance investigation",
              evidence: "case-42",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Legal hold already exists for this scope, data type, and target.",
    });
  });

  it("returns 404 when a release lookup is hidden or missing", async () => {
    const handler = createTestHandler({
      releaseRetentionLegalHold: () =>
        Effect.fail({
          _tag: "RetentionLegalHoldNotFoundError",
          legalHoldId: "retention-legal-hold:organization:org_2:1",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminRetentionLegalHoldApiPath.releaseLegalHold}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_1",
              legalHoldId: "retention-legal-hold:organization:org_2:1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Requested resource was not found.",
    });
  });
});
