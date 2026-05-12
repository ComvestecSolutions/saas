import { createFileRoute } from "@tanstack/react-router";
import { createProductAppFileRoute } from "../../file-route";
import { handleProductStaleSessionRecoveryRequest } from "../../auth/session-transport-route";

export const Route = createProductAppFileRoute("/auth/stale-session")({
  server: {
    handlers: {
      GET: ({ request }: { readonly request: Request }) =>
        handleProductStaleSessionRecoveryRequest(process.env, request),
    },
  },
});
