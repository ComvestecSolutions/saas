import { createFileRoute } from "@tanstack/react-router";
import { handlePublicWebAuthStartRequest } from "../../auth/start-route";

export const Route = createFileRoute("/auth/start")({
  server: {
    handlers: {
      GET: ({ request }: { readonly request: Request }) =>
        handlePublicWebAuthStartRequest(process.env, request),
    },
  },
});
