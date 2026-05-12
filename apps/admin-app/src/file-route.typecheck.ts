import { createAdminAppFileRoute } from "./file-route";

const validAdminRouteSeed = createAdminAppFileRoute("/");

void validAdminRouteSeed;

const invalidAdminRouteSeed =
  // @ts-expect-error admin app file-route helpers must reject invalid route literals
  createAdminAppFileRoute("/billing/checkout");

void invalidAdminRouteSeed;

export {};
