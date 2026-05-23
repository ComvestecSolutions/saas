/**
 * Trusted request-context resolver (admin-app implementation
 * plan §9 item 3 follow-up). Extracts the previously-inlined
 * pattern from `services/communication/operations-home-http.ts`
 * so route loaders and HTTP handlers share one resolver path
 * instead of each binding to Valkey directly.
 *
 * The resolver:
 *   1. Reads the subscriber-journey session id from the request
 *      header (route-server boundary).
 *   2. Decodes the minimal environment fragment it needs
 *      (`VALKEY_URL`) at the boundary with a concrete non-empty
 *      schema, with no synthesised localhost fallback.
 *   3. Opens a Valkey adapter, resolves the identity-session
 *      backed `RequestContext`, and always closes the adapter
 *      through `Effect.ensuring`.
 *
 * Callers never touch Valkey or the identity-session module
 * directly, which is the explicit goal of the extraction.
 */
import { Effect, ParseResult, Schema } from "effect";
import { type RequestContext } from "@comvestec/contracts";
import {
  resolveIdentitySessionRequestContext,
  type IdentitySessionRequestContextNotFoundError,
} from "@comvestec/modules";
import {
  makeValkeyAdapter,
  type ValkeyAdapterOperationError,
} from "../../adapters";
import {
  extractRequiredSubscriberJourneySessionIdFromHeader,
  type SubscriberJourneySessionIdMissingError,
} from "./request-context-transport";

const TrustedRequestContextEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeTrustedRequestContextEnvironment = Schema.decodeUnknown(
  TrustedRequestContextEnvironmentSchema,
);

export type ResolveTrustedRequestContextError =
  | ParseResult.ParseError
  | ValkeyAdapterOperationError
  | IdentitySessionRequestContextNotFoundError
  | SubscriberJourneySessionIdMissingError;

const resolveTrustedRequestContextFromSessionId = (
  environment: unknown,
  sessionId: string,
): Effect.Effect<
  RequestContext,
  Exclude<
    ResolveTrustedRequestContextError,
    SubscriberJourneySessionIdMissingError
  >
> =>
  Effect.gen(function* () {
    const resolvedEnvironment =
      yield* decodeTrustedRequestContextEnvironment(environment);
    const valkey = yield* makeValkeyAdapter({
      url: resolvedEnvironment.VALKEY_URL,
    });
    return yield* resolveIdentitySessionRequestContext(valkey, {
      sessionId,
    }).pipe(Effect.ensuring(Effect.ignore(valkey.close)));
  });

/**
 * Resolves the trusted operator `RequestContext` for an inbound
 * HTTP request by extracting the subscriber-journey session id
 * from the canonical header, decoding the minimal environment
 * fragment, and consulting identity-session via the Valkey
 * adapter. Always closes the Valkey adapter.
 */
export const resolveTrustedRequestContextFromRequest = (
  environment: unknown,
  request: Request,
): Effect.Effect<RequestContext, ResolveTrustedRequestContextError> =>
  Effect.gen(function* () {
    const sessionId =
      yield* extractRequiredSubscriberJourneySessionIdFromHeader(request);
    return yield* resolveTrustedRequestContextFromSessionId(
      environment,
      sessionId,
    );
  });

export { resolveTrustedRequestContextFromSessionId };
