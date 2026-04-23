import { Effect } from "effect";
import {
  actorType,
  type ActorType,
  identityClaimKey,
} from "@comvestec/contracts";

export type WorkflowIdentity = {
  readonly preferredUsername?: string;
  readonly subject?: string;
  readonly issuer?: string;
  readonly tokenIdentifier?: string;
  readonly [claim: string]: unknown;
};

type WorkflowActorType =
  | typeof actorType.platformOperator
  | typeof actorType.serviceActor;

const isWorkflowActorType = (value: unknown): value is WorkflowActorType =>
  value === actorType.platformOperator || value === actorType.serviceActor;

const formatAllowedActorTypes = () =>
  [actorType.platformOperator, actorType.serviceActor].join(" or ");

export type WorkflowActorIdentityError = {
  readonly _tag: "WorkflowActorIdentityError";
  readonly operation: string;
  readonly reason: string;
};

export const getIdentityActorType = (
  identity: WorkflowIdentity,
): ActorType | undefined => {
  const actorTypeClaim = identity[identityClaimKey.actorType];

  return typeof actorTypeClaim === "string"
    ? (actorTypeClaim as ActorType)
    : undefined;
};

export const toWorkflowActorIdentityBoundaryError = (
  error: WorkflowActorIdentityError,
) => new Error(error.reason);

export const requireWorkflowActorIdentity = (
  identity: WorkflowIdentity | null,
  operation: string,
): Effect.Effect<
  {
    readonly identity: WorkflowIdentity;
    readonly actorType: WorkflowActorType;
  },
  WorkflowActorIdentityError
> => {
  if (identity === null) {
    return Effect.fail({
      _tag: "WorkflowActorIdentityError",
      operation,
      reason: `${operation} requires an authenticated Keycloak identity.`,
    } satisfies WorkflowActorIdentityError);
  }

  const actorTypeClaim = getIdentityActorType(identity);

  if (!isWorkflowActorType(actorTypeClaim)) {
    return Effect.fail({
      _tag: "WorkflowActorIdentityError",
      operation,
      reason: `${operation} requires a ${formatAllowedActorTypes()} Keycloak identity.`,
    } satisfies WorkflowActorIdentityError);
  }

  return Effect.succeed({
    identity,
    actorType: actorTypeClaim,
  } as const);
};
