import { createFileRoute } from "@tanstack/react-router";
import { createProductAppFileRoute } from "../../file-route";
import { handleProductLogoutRequest } from "../../auth/session-transport-route";

export const Route = createProductAppFileRoute("/auth/logout")({
  server: {
    handlers: {
      GET: ({ request }: { readonly request: Request }) =>
        handleProductLogoutRequest(process.env, request),
    },
  },
});
