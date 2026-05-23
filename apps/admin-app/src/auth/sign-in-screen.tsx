import { buildAdminAuthStartPath, type AdminAuthSignInReason } from "./paths";

type AdminSignInScreenProps = {
  readonly returnTo?: string;
  readonly reason?: AdminAuthSignInReason;
};

const reasonCopy: Record<
  AdminAuthSignInReason,
  { readonly title: string; readonly description: string }
> = {
  "access-denied": {
    title: "Operator access required",
    description:
      "This account could not open the admin workspace with the required operator privileges. Contact a platform administrator if access should be granted.",
  },
  "callback-expired": {
    title: "Sign-in window expired",
    description:
      "The previous sign-in attempt took too long or sat idle. Start sign-in again to continue.",
  },
  "restart-sign-in": {
    title: "Start sign-in again",
    description:
      "The previous sign-in handoff could not be completed cleanly. Start again to continue.",
  },
  "stale-session": {
    title: "Session expired",
    description: "Sign in again to continue where you left off.",
  },
  "sign-in-unavailable": {
    title: "Sign-in unavailable",
    description:
      "The admin sign-in handoff is not available right now. Try again in a moment, or contact a platform administrator if it keeps happening.",
  },
  "signed-out": {
    title: "Signed out",
    description: "Your admin session has been cleared.",
  },
};

export function AdminSignInScreen({
  returnTo,
  reason,
}: Readonly<AdminSignInScreenProps>) {
  const startHref = buildAdminAuthStartPath(
    returnTo === undefined ? {} : { returnTo },
  );
  const reasonPanel = reason === undefined ? undefined : reasonCopy[reason];
  const returnCopy =
    returnTo === undefined
      ? "After sign-in, you will land in the admin workspace."
      : "After sign-in, you will be returned to the page you were trying to open.";

  return (
    <div className="ops-auth-page">
      <main className="ops-auth-main">
        <section className="ops-auth-stage" aria-label="Admin sign-in">
          <div className="ops-auth-hero">
            <p className="ops-auth-eyebrow">Comvestec Operations</p>
            <div className="ops-auth-shell-preview" aria-hidden="true">
              <div className="ops-auth-shell-preview__pulse">
                <span>Mission</span>
                <span>Governance</span>
                <span>Revenue</span>
                <span>Vendors</span>
              </div>
              <div className="ops-auth-shell-preview__body">
                <div className="ops-auth-shell-preview__dock">
                  <span>MC</span>
                  <span>TN</span>
                  <span>GV</span>
                </div>
                <div className="ops-auth-shell-preview__grid">
                  <div className="ops-auth-shell-preview__panel">
                    <strong>12</strong>
                    <span>approvals waiting</span>
                  </div>
                  <div className="ops-auth-shell-preview__panel">
                    <strong>03</strong>
                    <span>vendor degradations</span>
                  </div>
                  <div className="ops-auth-shell-preview__panel">
                    <strong>24h</strong>
                    <span>audit visibility live</span>
                  </div>
                  <div className="ops-auth-shell-preview__panel">
                    <strong>Auto</strong>
                    <span>session token resolution</span>
                  </div>
                </div>
              </div>
            </div>
            <h1 className="ops-auth-hero-title">
              Sign in to the admin workspace
            </h1>
            <p className="ops-auth-copy">
              Enter the Signal Deck with your approved operator account. The
              workspace resolves current-session context automatically, surfaces
              backend control planes directly, and keeps operator workflows out
              of raw token and raw ID territory.
            </p>
          </div>

          <section className="ops-auth-panel">
            {reasonPanel === undefined ? null : (
              <div className="ops-auth-reason-panel">
                <p className="ops-auth-reason-title">{reasonPanel.title}</p>
                <p className="ops-auth-reason-copy">
                  {reasonPanel.description}
                </p>
              </div>
            )}

            <div className="ops-auth-checklist" aria-label="Access guidance">
              <div className="ops-auth-checkpoint">
                <span className="ops-auth-checkpoint-badge" aria-hidden="true">
                  01
                </span>
                <div className="ops-auth-checkpoint-copy-block">
                  <p className="ops-auth-checkpoint-title">
                    Approved operator access only
                  </p>
                  <p className="ops-auth-checkpoint-copy">
                    This workspace is only available to authorised admin
                    operators with the right backend control-plane capabilities.
                  </p>
                </div>
              </div>

              <div className="ops-auth-checkpoint">
                <span className="ops-auth-checkpoint-badge" aria-hidden="true">
                  02
                </span>
                <div className="ops-auth-checkpoint-copy-block">
                  <p className="ops-auth-checkpoint-title">Quick return</p>
                  <p className="ops-auth-checkpoint-copy">{returnCopy}</p>
                </div>
              </div>

              <div className="ops-auth-checkpoint">
                <span className="ops-auth-checkpoint-badge" aria-hidden="true">
                  03
                </span>
                <div className="ops-auth-checkpoint-copy-block">
                  <p className="ops-auth-checkpoint-title">
                    Current-session automation
                  </p>
                  <p className="ops-auth-checkpoint-copy">
                    Operator context, session identity, and route capability
                    state are carried into the desk automatically after sign-in.
                  </p>
                </div>
              </div>
            </div>

            <a className="ops-primary-button" href={startHref}>
              Continue to sign in
            </a>

            <p className="ops-auth-support">
              Need access? Contact a platform administrator.
            </p>
          </section>
        </section>
      </main>
    </div>
  );
}
