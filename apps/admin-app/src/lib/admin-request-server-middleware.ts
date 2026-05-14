import { createMiddleware } from "@tanstack/react-start";
import {
  tanstackStartServerRuntime,
  type TanstackStartServerRuntime,
} from "./tanstack-start-server-runtime";

export type AdminRequestContext = {
  readonly request: Request;
};

export const adminRequestServerMiddleware = createMiddleware().server(
  async ({ next, request }) => next({ context: { request } }),
);

export const createAdminRequestMiddleware = (
  serverRuntime: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  serverRuntime
    .createMiddleware()
    .server(async ({ next, request }) => next({ context: { request } }));
