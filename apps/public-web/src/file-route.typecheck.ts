import { createPublicWebFileRoute } from "./file-route";

const validPublicWebRouteSeed = createPublicWebFileRoute("/billing/success");

void validPublicWebRouteSeed;

const invalidPublicWebRouteSeed =
  // @ts-expect-error public web file-route helpers must reject invalid route literals
  createPublicWebFileRoute("/not-a-real-route");

void invalidPublicWebRouteSeed;

export {};
