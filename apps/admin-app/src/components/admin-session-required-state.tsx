import { useRouterState } from "@tanstack/react-router";
import { PermissionDeniedState } from "@comvestec/ui";
import {
  buildAdminAuthReturnTo,
  buildAdminSignInPath,
  buildAdminStaleSessionPath,
} from "../auth/paths";

type AdminSessionRequiredStateProps = {
  readonly title: string;
  readonly description: string;
  readonly stale?: boolean;
};

export function AdminSessionRequiredState({
  title,
  description,
  stale = false,
}: Readonly<AdminSessionRequiredStateProps>) {
  const { pathname, searchStr } = useRouterState({
    select: (state) => state.location,
  });
  const returnTo = buildAdminAuthReturnTo({ pathname, searchStr });
  const signInHref = stale
    ? buildAdminStaleSessionPath({ returnTo })
    : buildAdminSignInPath({ returnTo });

  return (
    <PermissionDeniedState
      title={title}
      description={description}
      action={
        <div className="ops-inline-actions">
          <a className="ops-link-button" href={signInHref}>
            {stale ? "Refresh operator session" : "Sign in to continue"}
          </a>
        </div>
      }
    />
  );
}
