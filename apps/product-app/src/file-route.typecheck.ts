import { createProductAppFileRoute } from "./file-route";

const validProductRouteSeed = createProductAppFileRoute("/billing/checkout");

void validProductRouteSeed;

const invalidProductRouteSeed =
  // @ts-expect-error product app file-route helpers must reject invalid route literals
  createProductAppFileRoute("/not-a-real-route");

void invalidProductRouteSeed;

export {};
