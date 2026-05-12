import { createFileRoute } from "@tanstack/react-router";
import { createProductAppFileRoute } from "../../file-route";
import { handleProductAuthCallbackRequest } from "../../auth/callback-route";

export const Route = createProductAppFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: ({ request }: { readonly request: Request }) =>
        handleProductAuthCallbackRequest(process.env, request),
    },
  },
});
