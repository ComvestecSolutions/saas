import { createFileRoute } from "@tanstack/react-router";
import { createPublicWebFileRoute } from "../../file-route";
import { handlePublicWebAuthStartRequest } from "../../auth/start-route";

export const Route = createPublicWebFileRoute("/auth/start")({
  server: {
    handlers: {
      GET: ({ request }: { readonly request: Request }) =>
        handlePublicWebAuthStartRequest(process.env, request),
    },
  },
});
