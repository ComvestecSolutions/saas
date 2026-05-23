import { createAdminAppFileRoute } from "../../file-route";

export const Route = createAdminAppFileRoute("/auth/stale-session")({
  server: {
    handlers: {
      GET: ({ request }: { readonly request: Request }) =>
        import("../../auth/session-transport-route").then(
          ({ handleAdminStaleSessionRecoveryRequest }) =>
            handleAdminStaleSessionRecoveryRequest(process.env, request),
        ),
    },
  },
});
