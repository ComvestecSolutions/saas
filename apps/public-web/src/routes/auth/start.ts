import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { handlePublicWebAuthStartRequest } from "../../auth/start-route";

export const Route = createFileRoute("/auth/start")({
  server: {
    handlers: {
      GET: ({ request }: { readonly request: Request }) =>
        Effect.runPromise(
          handlePublicWebAuthStartRequest(process.env, request),
        ),
    },
  },
});
