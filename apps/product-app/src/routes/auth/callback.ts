import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { handleProductAuthCallbackRequest } from "../../auth/callback-route";

export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: ({ request }: { readonly request: Request }) =>
        Effect.runPromise(
          handleProductAuthCallbackRequest(process.env, request),
        ),
    },
  },
});
