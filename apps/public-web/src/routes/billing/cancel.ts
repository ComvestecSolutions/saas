import { createFileRoute } from "@tanstack/react-router";
import { createPublicWebFileRoute } from "../../file-route";
import { handlePublicWebBillingReturnRequest } from "../../billing/return-route";

export const Route = createPublicWebFileRoute("/billing/cancel")({
  server: {
    handlers: {
      GET: ({ request }: { readonly request: Request }) =>
        handlePublicWebBillingReturnRequest(process.env, request, "cancel"),
    },
  },
});
