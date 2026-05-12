import { createFileRoute } from "@tanstack/react-router";
import { createProductAppFileRoute } from "../../file-route";
import { handleProductBillingReturnRequest } from "../../billing/return-route";

export const Route = createProductAppFileRoute("/billing/success")({
  server: {
    handlers: {
      GET: ({ request }: { readonly request: Request }) =>
        handleProductBillingReturnRequest(process.env, request, "success"),
    },
  },
});
