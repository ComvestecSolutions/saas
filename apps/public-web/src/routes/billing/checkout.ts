import { createFileRoute } from "@tanstack/react-router";
import { createPublicWebFileRoute } from "../../file-route";
import { handlePublicWebBillingCheckoutRequest } from "../../billing/checkout-route";

export const Route = createPublicWebFileRoute("/billing/checkout")({
  server: {
    handlers: {
      GET: ({ request }: { readonly request: Request }) =>
        handlePublicWebBillingCheckoutRequest(process.env, request),
    },
  },
});
