import {
  usesAppLocalTypedFileRouteHelperCall,
  usesDisallowedCreateFileRouteCall,
} from "../../tooling/scripts/typecheck-coverage-route-audit";

describe("usesDisallowedCreateFileRouteCall", () => {
  it("rejects direct createFileRoute imports", () => {
    expect(
      usesDisallowedCreateFileRouteCall(
        [
          'import { createFileRoute } from "@tanstack/react-router";',
          'export const Route = createFileRoute("/")({});',
        ].join("\n"),
        "apps/public-web/src/routes/index.tsx",
      ),
    ).toBe(true);
  });

  it("rejects aliased createFileRoute imports", () => {
    expect(
      usesDisallowedCreateFileRouteCall(
        [
          'import { createFileRoute as defineRoute } from "@tanstack/react-router";',
          'export const Route = defineRoute("/")({});',
        ].join("\n"),
        "apps/public-web/src/routes/index.tsx",
      ),
    ).toBe(true);
  });

  it("rejects namespace property access rebinding", () => {
    expect(
      usesDisallowedCreateFileRouteCall(
        [
          'import * as Router from "@tanstack/react-router";',
          "const defineRoute = Router.createFileRoute;",
          'export const Route = defineRoute("/")({});',
        ].join("\n"),
        "apps/public-web/src/routes/index.tsx",
      ),
    ).toBe(true);
  });

  it("rejects namespace destructuring aliases", () => {
    expect(
      usesDisallowedCreateFileRouteCall(
        [
          'import * as Router from "@tanstack/react-router";',
          "const { createFileRoute: defineRoute } = Router;",
          'export const Route = defineRoute("/")({});',
        ].join("\n"),
        "apps/public-web/src/routes/index.tsx",
      ),
    ).toBe(true);
  });

  it("accepts app-local typed helper usage", () => {
    expect(
      usesDisallowedCreateFileRouteCall(
        [
          'import { createPublicWebFileRoute } from "../file-route";',
          'export const Route = createPublicWebFileRoute("/")({});',
        ].join("\n"),
        "apps/public-web/src/routes/index.tsx",
      ),
    ).toBe(false);
  });

  it("does not need to detect namespace destructuring assignment when no app-local helper is used", () => {
    expect(
      usesDisallowedCreateFileRouteCall(
        [
          'import * as Router from "@tanstack/react-router";',
          "let defineRoute;",
          "({ createFileRoute: defineRoute } = Router);",
          'export const Route = defineRoute("/")({});',
        ].join("\n"),
        "apps/public-web/src/routes/index.tsx",
      ),
    ).toBe(false);
  });
});

describe("usesAppLocalTypedFileRouteHelperCall", () => {
  it("accepts app-local typed helper usage", () => {
    expect(
      usesAppLocalTypedFileRouteHelperCall(
        [
          'import { createPublicWebFileRoute } from "../file-route";',
          'export const Route = createPublicWebFileRoute("/")({});',
        ].join("\n"),
        "apps/public-web/src/routes/index.tsx",
      ),
    ).toBe(true);
  });

  it("rejects sibling wrapper indirection", () => {
    expect(
      usesAppLocalTypedFileRouteHelperCall(
        [
          'import { defineRoute } from "./route-helper";',
          'export const Route = defineRoute("/")({});',
        ].join("\n"),
        "apps/public-web/src/routes/index.tsx",
      ),
    ).toBe(false);
  });

  it("rejects namespace destructuring assignment bypasses", () => {
    expect(
      usesAppLocalTypedFileRouteHelperCall(
        [
          'import * as Router from "@tanstack/react-router";',
          "let defineRoute;",
          "({ createFileRoute: defineRoute } = Router);",
          'export const Route = defineRoute("/")({});',
        ].join("\n"),
        "apps/public-web/src/routes/index.tsx",
      ),
    ).toBe(false);
  });

  it("rejects unused helper calls when exported Route uses a sibling wrapper", () => {
    expect(
      usesAppLocalTypedFileRouteHelperCall(
        [
          'import { createPublicWebFileRoute } from "../file-route";',
          'import { defineRoute } from "./route-helper";',
          'createPublicWebFileRoute("/health")({});',
          'export const Route = defineRoute("/")({});',
        ].join("\n"),
        "apps/public-web/src/routes/index.tsx",
      ),
    ).toBe(false);
  });

  it("rejects inline wrappers around the app-local helper", () => {
    expect(
      usesAppLocalTypedFileRouteHelperCall(
        [
          'import { createPublicWebFileRoute } from "../file-route";',
          'export const Route = ((path) => createPublicWebFileRoute(path))("/")({});',
        ].join("\n"),
        "apps/public-web/src/routes/index.tsx",
      ),
    ).toBe(false);
  });

  it("rejects alternate file-route index modules", () => {
    expect(
      usesAppLocalTypedFileRouteHelperCall(
        [
          'import { createPublicWebFileRoute } from "../file-route/index";',
          'export const Route = createPublicWebFileRoute("/")({});',
        ].join("\n"),
        "apps/public-web/src/routes/index.tsx",
      ),
    ).toBe(false);
  });
});
