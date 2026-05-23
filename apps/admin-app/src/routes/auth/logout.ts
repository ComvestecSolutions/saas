import { createAdminAppFileRoute } from "../../file-route";

export const Route = createAdminAppFileRoute("/auth/logout")({
  server: {
    handlers: {
      GET: ({ request }: { readonly request: Request }) =>
        import("../../auth/session-transport-route").then(
          ({ handleAdminLogoutRequest }) =>
            handleAdminLogoutRequest(process.env, request),
        ),
    },
  },
});
