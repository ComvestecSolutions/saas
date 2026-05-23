/**
 * Vendor-health aggregator pure-helper tests (admin-app
 * implementation plan §9 item 9). Covers the two helpers the
 * platform service and the future per-vendor read helpers slice
 * (§9 item 10) share:
 *
 *   - `summarizeWorstStatus(entries)` rolls up to the worst
 *     observed status using the documented severity ordering
 *     `unavailable > degraded > unknown > healthy` and collapses
 *     an empty list to `unknown` rather than fabricating
 *     `healthy`.
 *   - `isAggregateFresh(generatedAt, now, ttlSeconds)` flips
 *     `true` only when the cached aggregate is still within the
 *     operator-configured cache TTL and fails closed on negative
 *     or non-finite inputs so misconfiguration does not silently
 *     bypass the TTL boundary.
 */
import { describe, expect, it } from "vitest";
import {
  isAggregateFresh,
  summarizeWorstStatus,
  type VendorHealthAggregateEntry,
} from "@comvestec/modules";

const entry = (
  serviceName: VendorHealthAggregateEntry["serviceName"],
  status: VendorHealthAggregateEntry["status"],
): VendorHealthAggregateEntry => ({
  serviceName,
  status,
  latencyMs: 1,
  lastCheckedAt: "2026-05-18T00:00:00.000Z",
});

describe("summarizeWorstStatus", () => {
  it("collapses an empty entries list to 'unknown'", () => {
    expect(summarizeWorstStatus([])).toBe("unknown");
  });

  it("returns 'healthy' when every entry is healthy", () => {
    expect(
      summarizeWorstStatus([
        entry("polar", "healthy"),
        entry("openmeter", "healthy"),
        entry("keycloak", "healthy"),
      ]),
    ).toBe("healthy");
  });

  it("promotes to 'degraded' when at least one entry is degraded and none are unavailable", () => {
    expect(
      summarizeWorstStatus([
        entry("polar", "healthy"),
        entry("openmeter", "degraded"),
        entry("keycloak", "healthy"),
      ]),
    ).toBe("degraded");
  });

  it("promotes to 'unavailable' when at least one entry is unavailable even alongside degraded entries", () => {
    expect(
      summarizeWorstStatus([
        entry("polar", "healthy"),
        entry("openmeter", "degraded"),
        entry("postgres", "unavailable"),
        entry("keycloak", "unknown"),
      ]),
    ).toBe("unavailable");
  });

  it("ranks 'unknown' above 'healthy' but below 'degraded'", () => {
    expect(
      summarizeWorstStatus([
        entry("polar", "healthy"),
        entry("convex", "unknown"),
      ]),
    ).toBe("unknown");
    expect(
      summarizeWorstStatus([
        entry("polar", "degraded"),
        entry("convex", "unknown"),
      ]),
    ).toBe("degraded");
  });
});

describe("isAggregateFresh", () => {
  const generatedAt = "2026-05-18T00:00:00.000Z";
  const generatedMs = new Date(generatedAt).getTime();

  it("returns true within the TTL window", () => {
    expect(isAggregateFresh(generatedAt, generatedMs + 10_000, 30)).toBe(true);
  });

  it("returns true exactly at the TTL boundary", () => {
    expect(isAggregateFresh(generatedAt, generatedMs + 30_000, 30)).toBe(true);
  });

  it("returns false once the aggregate is older than the TTL", () => {
    expect(isAggregateFresh(generatedAt, generatedMs + 30_001, 30)).toBe(false);
  });

  it("fails closed on a negative age (clock skew producing now < generatedAt)", () => {
    expect(isAggregateFresh(generatedAt, generatedMs - 1, 30)).toBe(false);
  });

  it("fails closed on a non-positive TTL", () => {
    expect(isAggregateFresh(generatedAt, generatedMs + 1, 0)).toBe(false);
    expect(isAggregateFresh(generatedAt, generatedMs + 1, -5)).toBe(false);
  });

  it("fails closed on a malformed generatedAt timestamp", () => {
    expect(isAggregateFresh("not-a-date", generatedMs, 30)).toBe(false);
  });
});
