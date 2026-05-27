import { universalSearchFacet } from "@comvestec/contracts";
import { describe, expect, it } from "vitest";
import {
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ? describe.skip : describe;

describeLocalBackendE2e("backend e2e universal-search transport", () => {
  const environment = localBackendE2eEnvironment!;

  const runUniversalSearchProbe = () =>
    runBackendE2eBunProbe<{
      readonly unauthenticatedStatus: number;
      readonly unauthenticatedBody: {
        readonly error: string;
      };
      readonly firstSearchStatus: number;
      readonly firstSearchBody: {
        readonly result: {
          readonly entries: ReadonlyArray<{
            readonly facet: string;
            readonly id: string;
            readonly label: string;
          }>;
        };
        readonly fromCache: boolean;
      };
      readonly secondSearchStatus: number;
      readonly secondSearchBody: {
        readonly result: {
          readonly entries: ReadonlyArray<{
            readonly facet: string;
            readonly id: string;
          }>;
        };
        readonly fromCache: boolean;
      };
      readonly domainSearchStatus: number;
      readonly domainSearchBody: {
        readonly result: {
          readonly entries: ReadonlyArray<{
            readonly facet: string;
            readonly label: string;
          }>;
        };
        readonly fromCache: boolean;
      };
      readonly tenantScopeId: string;
      readonly adminMemberId: string;
      readonly auditEventId: string;
      readonly invoiceEventId: string;
      readonly webhookSubscriptionId: string;
      readonly domainHost: string;
    }>(
      `import { Effect } from 'effect';
import {
  actorType,
  platformModuleId,
  platformScope,
  reasonCatalogId,
} from '@comvestec/contracts';
import {
  makePostgresAdapter,
  makeValkeyAdapter,
  subscriberJourneySessionHeaderName,
  universalSearchApiPath,
} from '@comvestec/platform';
import { createBackendApiRequestHandler } from '@comvestec/platform/http';
import { adminMembersTable } from './packages/modules/src/persistence/postgres/access/admin-organization.ts';
import { webhookSubscriptionsTable } from './packages/modules/src/persistence/postgres/domains/webhooks-api-access/schema.ts';
import { billingPaymentEventsTable } from './packages/modules/src/persistence/postgres/domains/billing.ts';
import { tenantOnboardingRunsTable } from './packages/modules/src/persistence/postgres/domains/tenant-onboarding.ts';
import { tenantBrandingDomainVerificationTable } from './packages/modules/src/persistence/postgres/domains/tenant-branding.ts';
import { auditLogEventsTable } from './packages/modules/src/persistence/postgres/governance/audit-log.ts';

const runStep = async (label, operation, timeoutMs = 15000) => {
  let timeoutHandle;

  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(label + ' timed out after ' + timeoutMs + 'ms.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
};

const runId = Date.now().toString();
const actorId = 'usr_backend_e2e_universal_search_operator';
const sessionId = 'sess_backend_e2e_universal_search_' + runId;
const correlationId = 'corr_backend_e2e_universal_search_' + runId;
const tenantScopeId = 'org_backend_e2e_acme_' + runId;
const adminMemberId =
  '00000000-0000-4000-8000-' + runId.padStart(12, '0').slice(-12);
const auditEventId = 'audit_backend_e2e_universal_search_' + runId;
const invoiceEventId = 'invoice_backend_e2e_universal_search_' + runId;
const webhookSubscriptionId = 'whsub_backend_e2e_universal_search_' + runId;
const domainHost = 'acme-' + runId + '.example.com';
const onboardingRunId = 'onboarding_backend_e2e_universal_search_' + runId;
const verificationId = 'domain_backend_e2e_universal_search_' + runId;
const now = new Date();

const valkey = await Effect.runPromise(
  makeValkeyAdapter({ url: process.env.VALKEY_URL }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId,
    requestContext: {
      actorType: actorType.platformOperator,
      actorId,
      sessionId,
      correlationId,
      reason: 'Validate universal-search backend route family',
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    },
  }),
);
await Effect.runPromise(Effect.ignore(valkey.close));

const postgres = await Effect.runPromise(
  makePostgresAdapter({
    connectionString: process.env.POSTGRES_URL,
  }),
);
await postgres.database.insert(adminMembersTable).values({
  id: adminMemberId,
  keycloakSubjectId: 'kc_backend_e2e_universal_search_' + runId,
  email: 'acme.operator+' + runId + '@example.com',
  displayName: 'Acme Operator ' + runId,
  role: 'platform-operator',
  status: 'active',
  invitedAt: now,
  acceptedAt: now,
  lastActiveAt: now,
  createdBy: 'system',
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
});
await postgres.database.insert(tenantOnboardingRunsTable).values({
  runId: onboardingRunId,
  tenantScope: platformScope.organization,
  tenantScopeId,
  triggeredBy: actorId,
  status: 'completed',
  currentStepId: 'finalize',
  correlationId,
  metadata: {},
  startedAt: now,
  completedAt: now,
});
await postgres.database.insert(auditLogEventsTable).values({
  eventId: auditEventId,
  moduleId: platformModuleId.runtimeConfig,
  action: 'override-changed',
  target: tenantScopeId + ':feature-toggle',
  actorId,
  tenantScope: platformScope.platform,
  tenantScopeId: platformScope.platform,
  reason: 'Acme runtime config review',
  correlationId,
  requestContext: {},
  recordedAt: now,
});
await postgres.database.insert(billingPaymentEventsTable).values({
  eventId: invoiceEventId,
  provider: 'polar',
  providerEventId: 'invoice_acme_' + runId,
  subscriptionId: null,
  scope: platformScope.organization,
  scopeId: tenantScopeId,
  eventType: 'invoice.paid',
  status: 'paid',
  amountMinor: 4999,
  currency: 'USD',
  effectiveAt: now,
  payload: {},
  recordedAt: now,
});
await postgres.database.insert(webhookSubscriptionsTable).values({
  subscriptionId: webhookSubscriptionId,
  scope: platformScope.organization,
  scopeId: tenantScopeId,
  url: 'https://' + domainHost + '/webhook',
  events: ['invoice.paid'],
  status: 'active',
  lastDeliveryAt: now,
  createdAt: now,
  updatedAt: now,
});
await postgres.database.insert(tenantBrandingDomainVerificationTable).values({
  verificationId,
  scope: platformScope.organization,
  scopeId: tenantScopeId,
  requestedHost: domainHost,
  lifecycleState: 'verified',
  dnsProof: { txt: 'verify' },
  approvedBy: actorId,
  approvalNotes: 'backend e2e universal search',
  changedAt: now,
});

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const unauthenticatedResponse = await runStep(
    'universal search without trusted session header',
    fetch(new URL(universalSearchApiPath.search, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'acme',
        reasonCatalogId: reasonCatalogId.universalSearchRead,
      }),
    }),
  );
  const firstSearchResponse = await runStep(
    'universal search primary query',
    fetch(new URL(universalSearchApiPath.search, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        query: 'acme',
        reasonCatalogId: reasonCatalogId.universalSearchRead,
      }),
    }),
  );
  const secondSearchResponse = await runStep(
    'universal search cached query',
    fetch(new URL(universalSearchApiPath.search, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        query: 'acme',
        reasonCatalogId: reasonCatalogId.universalSearchRead,
      }),
    }),
  );
  const domainSearchResponse = await runStep(
    'universal search custom domain prefix query',
    fetch(new URL(universalSearchApiPath.search, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        query: 'acme',
        prefixFilter: 'd',
        reasonCatalogId: reasonCatalogId.universalSearchRead,
      }),
    }),
  );

  console.log(JSON.stringify({
    unauthenticatedStatus: unauthenticatedResponse.status,
    unauthenticatedBody: await unauthenticatedResponse.json(),
    firstSearchStatus: firstSearchResponse.status,
    firstSearchBody: await firstSearchResponse.json(),
    secondSearchStatus: secondSearchResponse.status,
    secondSearchBody: await secondSearchResponse.json(),
    domainSearchStatus: domainSearchResponse.status,
    domainSearchBody: await domainSearchResponse.json(),
    tenantScopeId,
    adminMemberId,
    auditEventId,
    invoiceEventId,
    webhookSubscriptionId,
    domainHost,
  }));
} finally {
  server.stop(true);
  await Effect.runPromise(Effect.ignore(postgres.close));
}`,
      {
        env: {
          ...process.env,
          ...environment,
        },
        timeoutMs: 90_000,
      },
    );

  it("serves live universal-search results over the backend HTTP transport", async () => {
    const result = await runUniversalSearchProbe();

    expect(result.unauthenticatedStatus).toBe(401);
    expect(result.unauthenticatedBody.error).toBeTruthy();

    expect(result.firstSearchStatus).toBe(200);
    expect(result.firstSearchBody.fromCache).toBe(false);
    expect(
      new Set(
        result.firstSearchBody.result.entries.map((entry) => entry.facet),
      ),
    ).toEqual(
      new Set([
        universalSearchFacet.tenants,
        universalSearchFacet.users,
        universalSearchFacet.auditEvents,
        universalSearchFacet.invoices,
        universalSearchFacet.webhooks,
        universalSearchFacet.customDomains,
      ]),
    );
    expect(
      result.firstSearchBody.result.entries.find(
        (entry) =>
          entry.facet === universalSearchFacet.tenants &&
          entry.id === result.tenantScopeId,
      ),
    ).toBeDefined();
    expect(
      result.firstSearchBody.result.entries.find(
        (entry) =>
          entry.facet === universalSearchFacet.users &&
          entry.id === result.adminMemberId,
      ),
    ).toBeDefined();
    expect(
      result.firstSearchBody.result.entries.find(
        (entry) =>
          entry.facet === universalSearchFacet.auditEvents &&
          entry.id === result.auditEventId,
      ),
    ).toBeDefined();
    expect(
      result.firstSearchBody.result.entries.find(
        (entry) =>
          entry.facet === universalSearchFacet.invoices &&
          entry.id === result.invoiceEventId,
      ),
    ).toBeDefined();
    expect(
      result.firstSearchBody.result.entries.find(
        (entry) =>
          entry.facet === universalSearchFacet.webhooks &&
          entry.id === result.webhookSubscriptionId,
      ),
    ).toBeDefined();
    expect(
      result.firstSearchBody.result.entries.find(
        (entry) =>
          entry.facet === universalSearchFacet.customDomains &&
          entry.label === result.domainHost,
      ),
    ).toBeDefined();

    expect(result.secondSearchStatus).toBe(200);
    expect(result.secondSearchBody.fromCache).toBe(true);

    expect(result.domainSearchStatus).toBe(200);
    expect(result.domainSearchBody.fromCache).toBe(false);
    expect(
      result.domainSearchBody.result.entries.every(
        (entry) => entry.facet === universalSearchFacet.customDomains,
      ),
    ).toBe(true);
    expect(
      result.domainSearchBody.result.entries.some(
        (entry) => entry.label === result.domainHost,
      ),
    ).toBe(true);
  });
});
