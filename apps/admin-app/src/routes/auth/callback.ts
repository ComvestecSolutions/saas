import { createAdminAppFileRoute } from "../../file-route";

export const Route = createAdminAppFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: ({ request }: { readonly request: Request }) =>
        import("../../auth/callback-route").then(
          ({ handleAdminAuthCallbackRequest }) =>
            handleAdminAuthCallbackRequest(process.env, request),
        ),
    },
  },
});
