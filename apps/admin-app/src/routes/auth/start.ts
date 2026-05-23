import { createAdminAppFileRoute } from "../../file-route";

export const Route = createAdminAppFileRoute("/auth/start")({
  server: {
    handlers: {
      GET: ({ request }: { readonly request: Request }) =>
        import("../../auth/start-route").then(
          ({ handleAdminAuthStartRequest }) =>
            handleAdminAuthStartRequest(process.env, request),
        ),
    },
  },
});
