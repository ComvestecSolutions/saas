import { Effect } from "effect";
import type {
  AuthorizationDelegatedCheck,
  AuthorizationDelegatedCheckError,
  AuthorizationDelegatedTupleLookup,
} from "@comvestec/modules";
import type { OryKetoAdapterService } from "../../adapters";

export const createOryKetoAuthorizationDelegatedCheck =
  (
    oryKeto: Pick<OryKetoAdapterService, "check">,
  ): AuthorizationDelegatedCheck =>
  (input) =>
    oryKeto
      .check({
        namespace: input.namespace,
        object: input.object,
        relation: input.relation,
        subject: input.subject,
      })
      .pipe(
        Effect.map((result) => result.allowed),
        Effect.mapError(
          (cause): AuthorizationDelegatedCheckError => ({
            _tag: "AuthorizationDelegatedCheckError",
            reason: "Failed to evaluate persisted authorization relation.",
            cause,
          }),
        ),
      );

export const createOryKetoAuthorizationDelegatedTupleLookup =
  (
    oryKeto: Pick<OryKetoAdapterService, "listTuples">,
  ): AuthorizationDelegatedTupleLookup =>
  (input) =>
    Effect.forEach(
      input.subjects,
      (subject) =>
        oryKeto
          .listTuples({
            namespace: input.namespace,
            object: input.object,
            relation: input.relation,
            subject,
          })
          .pipe(
            Effect.map((tuples) =>
              tuples.map((tuple) => ({
                namespace: input.namespace,
                object: tuple.object,
                relation: input.relation,
                subject: tuple.subject,
                tenantScope: input.tenantScope,
                tenantScopeId: input.tenantScopeId,
              })),
            ),
          ),
      { concurrency: 1 },
    ).pipe(
      Effect.map((tupleGroups) => tupleGroups.flat()),
      Effect.mapError(
        (cause): AuthorizationDelegatedCheckError => ({
          _tag: "AuthorizationDelegatedCheckError",
          reason: "Failed to inspect persisted authorization relations.",
          cause,
        }),
      ),
    );
