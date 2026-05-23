/**
 * Universal omnibar search pure-helper tests (admin-app
 * implementation plan §9 item 11). Covers the two helpers the
 * platform service (commit 4) and the admin omnibar (Phase 2)
 * share:
 *
 *   - `isIndexFresh(lastReindexedAt, now, thresholdSeconds)`
 *     flips `true` only when the per-facet Meilisearch index is
 *     within the operator-configured freshness threshold and
 *     fails closed on negative / non-finite inputs and future-
 *     dated `lastReindexedAt` (clock skew) so misconfiguration
 *     never silently advertises a stale index as fresh.
 *   - `resolvePrefixToFacets(prefix?)` resolves every documented
 *     omnibar prefix (`t/f/c/u/inv/d/kc/ev`) to the exact subset
 *     of facets the universal search should query, and returns
 *     the full facet list when no prefix is supplied.
 */
import { describe, expect, it } from "vitest";
import {
  isIndexFresh,
  resolvePrefixToFacets,
  universalSearchFacet,
  universalSearchFacets,
  universalSearchPrefix,
} from "@comvestec/modules";

describe("universal-search — isIndexFresh", () => {
  const now = new Date("2026-02-01T00:00:00.000Z").getTime();

  it("returns true when lastReindexedAt is inside the threshold window", () => {
    expect(isIndexFresh("2026-02-01T00:00:00.000Z", now + 60_000, 600)).toBe(
      true,
    );
  });

  it("returns false when lastReindexedAt is older than threshold", () => {
    expect(isIndexFresh("2025-01-01T00:00:00.000Z", now, 600)).toBe(false);
  });

  it("returns false on non-finite threshold (NaN)", () => {
    expect(isIndexFresh("2026-02-01T00:00:00.000Z", now, Number.NaN)).toBe(
      false,
    );
  });

  it("returns false on zero or negative threshold (fails closed)", () => {
    expect(isIndexFresh("2026-02-01T00:00:00.000Z", now, 0)).toBe(false);
    expect(isIndexFresh("2026-02-01T00:00:00.000Z", now, -10)).toBe(false);
  });

  it("returns false when lastReindexedAt is in the future (clock skew)", () => {
    expect(isIndexFresh("2027-01-01T00:00:00.000Z", now, 600)).toBe(false);
  });

  it("returns false when lastReindexedAt is an unparseable timestamp", () => {
    expect(isIndexFresh("not-a-timestamp", now, 600)).toBe(false);
  });
});

describe("universal-search — resolvePrefixToFacets", () => {
  it("returns all 8 facets when no prefix is supplied", () => {
    const resolved = resolvePrefixToFacets(undefined);
    expect(resolved).toHaveLength(universalSearchFacets.length);
    expect(new Set(resolved)).toEqual(new Set(universalSearchFacets));
  });

  it("maps every documented omnibar prefix to the correct facet subset", () => {
    expect(resolvePrefixToFacets(universalSearchPrefix.tenant)).toEqual([
      universalSearchFacet.tenants,
    ]);
    expect(resolvePrefixToFacets(universalSearchPrefix.flag)).toEqual([
      universalSearchFacet.featureFlags,
    ]);
    expect(resolvePrefixToFacets(universalSearchPrefix.config)).toEqual([
      universalSearchFacet.configKeys,
    ]);
    expect(resolvePrefixToFacets(universalSearchPrefix.user)).toEqual([
      universalSearchFacet.users,
    ]);
    expect(resolvePrefixToFacets(universalSearchPrefix.invoice)).toEqual([
      universalSearchFacet.invoices,
    ]);
    expect(resolvePrefixToFacets(universalSearchPrefix.domain)).toEqual([
      universalSearchFacet.customDomains,
    ]);
    expect(resolvePrefixToFacets(universalSearchPrefix.keycloakUser)).toEqual([
      universalSearchFacet.users,
    ]);
    expect(resolvePrefixToFacets(universalSearchPrefix.event)).toEqual([
      universalSearchFacet.auditEvents,
    ]);
  });
});
