import { createFileRoute } from "@tanstack/react-router";
import { handleProductAuthCallbackRequest } from "../../auth/callback-route";

export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: ({ request }: { readonly request: Request }) =>
        handleProductAuthCallbackRequest(process.env, request),
    },
  },
});
