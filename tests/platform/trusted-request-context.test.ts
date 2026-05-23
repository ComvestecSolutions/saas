/**
 * Trusted request-context resolver tests (admin-app
 * implementation plan §9 item 3 follow-up). Covers the boundary
 * decode (`ParseError` on missing `VALKEY_URL`) and the
 * source-guard that keeps Valkey adapter wiring out of the
 * exported helper signature.
 */
import { describe, expect, it } from "vitest";
import { Effect, Exit } from "effect";
import {
  resolveTrustedRequestContextFromRequest,
  subscriberJourneySessionHeaderName,
} from "@comvestec/platform";

describe("trusted request-context resolver", () => {
  it("fails with SubscriberJourneySessionIdMissingError when the canonical header is absent", async () => {
    const request = new Request("https://admin.local/api/operations-home", {
      headers: { "x-other-header": "x" },
    });

    const exit = await Effect.runPromiseExit(
      resolveTrustedRequestContextFromRequest({}, request),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (!Exit.isFailure(exit)) return;
    const error = (exit.cause as { _tag: string; error?: { _tag: string } })
      .error as { _tag: string } | undefined;
    expect(error?._tag).toBe("SubscriberJourneySessionIdMissingError");
  });

  it("fails with a ParseError when the environment is missing VALKEY_URL", async () => {
    const request = new Request("https://admin.local/api/operations-home", {
      headers: {
        [subscriberJourneySessionHeaderName]: "sess-trusted-context",
      },
    });

    const exit = await Effect.runPromiseExit(
      resolveTrustedRequestContextFromRequest({}, request),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (!Exit.isFailure(exit)) return;
    const error = (exit.cause as { error?: { _tag: string } }).error;
    expect(error?._tag).toBe("ParseError");
  });

  it("source declares the canonical shared error type and never inlines a Valkey adapter literal", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        "packages/platform/src/services/access/trusted-request-context.ts",
      ),
      "utf8",
    );
    expect(source.includes("ResolveTrustedRequestContextError")).toBe(true);
    expect(
      source.includes("extractRequiredSubscriberJourneySessionIdFromHeader"),
    ).toBe(true);
    expect(source.includes("resolveIdentitySessionRequestContext")).toBe(true);
    expect(source.includes("makeValkeyAdapter")).toBe(true);

    const httpSource = await fs.readFile(
      path.resolve(
        "packages/platform/src/services/communication/operations-home-http.ts",
      ),
      "utf8",
    );
    expect(httpSource.includes("makeValkeyAdapter")).toBe(false);
    expect(httpSource.includes("resolveIdentitySessionRequestContext")).toBe(
      false,
    );
    expect(httpSource.includes("resolveTrustedRequestContextFromRequest")).toBe(
      true,
    );
  });
});
