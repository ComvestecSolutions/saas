import { createFileRoute } from "@tanstack/react-router";
import { createProductAppFileRoute } from "../../file-route";
import { handleProductBillingCheckoutRequest } from "../../billing/checkout-route";

export const Route = createProductAppFileRoute("/billing/checkout")({
  server: {
    handlers: {
      GET: ({ request }: { readonly request: Request }) =>
        handleProductBillingCheckoutRequest(process.env, request),
    },
  },
});
