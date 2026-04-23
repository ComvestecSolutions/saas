import { Effect } from "effect";
import type {
  AuthorizationDelegatedCheck,
  AuthorizationDelegatedCheckError,
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
