import {
  collectEffectBoundaryViolationFiles,
  validateAdminRouteFileContents,
  validateAdminRouteServerFileContents,
} from "../../tooling/scripts/validation/check-effect-boundaries";

describe("validateAdminRouteFileContents", () => {
  it("flags Schema.validateSync in admin-app route validateSearch boundaries", () => {
    expect(
      validateAdminRouteFileContents(
        "apps/admin-app/src/routes/desk/example.tsx",
        `
          const Route = createFileRoute("/desk/example")({
            validateSearch: (raw) => Schema.validateSync(RawSearchSchema)(raw),
          });
        `,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "admin-route-no-schema-validate-sync",
        }),
      ]),
    );
  });

  it("flags validateSearch helper references that never decode", () => {
    expect(
      validateAdminRouteFileContents(
        "apps/admin-app/src/routes/desk/example.tsx",
        `
          const parseSearch = (search: RawSearch | undefined) => search ?? {};

          const Route = createFileRoute("/desk/example")({
            validateSearch: parseSearch,
          });
        `,
      ),
    ).toEqual([
      expect.objectContaining({
        ruleId: "admin-route-validate-search-reference",
      }),
    ]);
  });

  it("allows validateSearch helpers that accept unknown and decode", () => {
    expect(
      validateAdminRouteFileContents(
        "apps/admin-app/src/routes/desk/example.tsx",
        `
          import { decodeSyncBoundary } from "../../lib/effect-boundary";

          const RawSearchSchema = Schema.Struct({
            query: Schema.optional(Schema.String),
          });
          const decodeRawSearch = decodeSyncBoundary(RawSearchSchema);

          const parseSearch = (raw: unknown) => decodeRawSearch(raw);

          const Route = createFileRoute("/desk/example")({
            validateSearch: parseSearch,
          });
        `,
      ),
    ).toEqual([]);
  });
});

describe("validateAdminRouteServerFileContents", () => {
  it("flags bare normalizer references passed to inputValidator", () => {
    expect(
      validateAdminRouteServerFileContents(
        "apps/admin-app/src/lib/example-route-server.ts",
        `
          export const getData = createServerFn({ method: "GET" })
            .inputValidator(normalizeScopeSelectionInput);
        `,
      ),
    ).toEqual([
      expect.objectContaining({
        ruleId: "admin-route-server-input-validator-reference",
      }),
    ]);
  });

  it("flags decode-named helper references that still bypass unknown decoding", () => {
    expect(
      validateAdminRouteServerFileContents(
        "apps/admin-app/src/lib/example-route-server.ts",
        `
          const decodeAdminLoaderInput = (input: AdminLoaderInput | undefined) =>
            input ?? {};

          export const getData = createServerFn({ method: "GET" })
            .inputValidator(decodeAdminLoaderInput);
        `,
      ),
    ).toEqual([
      expect.objectContaining({
        ruleId: "admin-route-server-input-validator-reference",
      }),
    ]);
  });

  it("flags inline validators that keep a typed input instead of unknown", () => {
    expect(
      validateAdminRouteServerFileContents(
        "apps/admin-app/src/lib/example-route-server.ts",
        `
          export const getData = createServerFn({ method: "GET" })
            .inputValidator((input: AdminLoaderInput | undefined) => input ?? {});
        `,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "admin-route-server-input-validator-inline-input-type",
        }),
        expect.objectContaining({
          ruleId: "admin-route-server-input-validator-inline-decode",
        }),
      ]),
    );
  });

  it("rejects arbitrary object decodeUnknown helpers", () => {
    expect(
      validateAdminRouteServerFileContents(
        "apps/admin-app/src/lib/example-route-server.ts",
        `
          const customHelper = {
            decodeUnknownInput: (input: unknown) => input,
          };

          export const getData = createServerFn({ method: "GET" })
            .inputValidator((input: unknown) => customHelper.decodeUnknownInput(input));
        `,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "admin-route-server-input-validator-inline-decode",
        }),
      ]),
    );
  });

  it("rejects Schema.decodeUnknownSync at inputValidator boundaries", () => {
    expect(
      validateAdminRouteServerFileContents(
        "apps/admin-app/src/lib/example-route-server.ts",
        `
          import { Schema } from "effect";

          export const getData = createServerFn({ method: "GET" })
            .inputValidator((input: unknown) =>
              Schema.decodeUnknownSync(AdminLoaderInputSchema)(input),
            );
        `,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "admin-route-server-input-validator-inline-decode",
        }),
      ]),
    );
  });

  it("rejects dead decodes that do not flow into the returned value", () => {
    expect(
      validateAdminRouteServerFileContents(
        "apps/admin-app/src/lib/example-route-server.ts",
        `
          import { decodeSyncBoundary } from "./effect-boundary";

          const AdminLoaderInputSchema = Schema.Struct({
            query: Schema.optional(Schema.String),
          });
          const decodeAdminLoaderInput = decodeSyncBoundary(AdminLoaderInputSchema);

          export const getData = createServerFn({ method: "GET" })
            .inputValidator((input: unknown) => {
              const decoded = decodeAdminLoaderInput(input);
              return input as { readonly query?: string };
            });
        `,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "admin-route-server-input-validator-inline-decode",
        }),
      ]),
    );
  });

  it("rejects destructured raw boundary leaks in returned values", () => {
    expect(
      validateAdminRouteServerFileContents(
        "apps/admin-app/src/lib/example-route-server.ts",
        `
          import { decodeSyncBoundary } from "./effect-boundary";

          const AdminLoaderInputSchema = Schema.Struct({
            query: Schema.optional(Schema.String),
            leaked: Schema.optional(Schema.String),
          });
          const decodeAdminLoaderInput = decodeSyncBoundary(AdminLoaderInputSchema);

          export const getData = createServerFn({ method: "GET" })
            .inputValidator((input: unknown) => {
              const decoded = decodeAdminLoaderInput(input);
              const { leaked } = input as { readonly leaked?: string };

              return {
                query: decoded.query,
                leaked,
              };
            });
        `,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "admin-route-server-input-validator-inline-decode",
        }),
      ]),
    );
  });

  it("rejects passthrough helper aliases of raw boundary input", () => {
    expect(
      validateAdminRouteServerFileContents(
        "apps/admin-app/src/lib/example-route-server.ts",
        `
          import { decodeSyncBoundary } from "./effect-boundary";

          const AdminLoaderInputSchema = Schema.Struct({
            query: Schema.optional(Schema.String),
          });
          const decodeAdminLoaderInput = decodeSyncBoundary(AdminLoaderInputSchema);
          const passthrough = <T>(value: T): T => value;

          export const getData = createServerFn({ method: "GET" })
            .inputValidator((input: unknown) => {
              const decoded = decodeAdminLoaderInput(input);
              const leaked = passthrough(input);

              return {
                query: decoded.query,
                leaked,
              };
            });
        `,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "admin-route-server-input-validator-inline-decode",
        }),
      ]),
    );
  });

  it("rejects destructuring assignment leaks after declaration", () => {
    expect(
      validateAdminRouteServerFileContents(
        "apps/admin-app/src/lib/example-route-server.ts",
        `
          import { decodeSyncBoundary } from "./effect-boundary";

          const AdminLoaderInputSchema = Schema.Struct({
            query: Schema.optional(Schema.String),
            leaked: Schema.optional(Schema.String),
          });
          const decodeAdminLoaderInput = decodeSyncBoundary(AdminLoaderInputSchema);

          export const getData = createServerFn({ method: "GET" })
            .inputValidator((input: unknown) => {
              const decoded = decodeAdminLoaderInput(input);
              let leaked: string | undefined;
              ({ leaked } = input as { readonly leaked?: string });

              return {
                query: decoded.query,
                leaked,
              };
            });
        `,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "admin-route-server-input-validator-inline-decode",
        }),
      ]),
    );
  });

  it("rejects raw boundary return branches even when another branch decodes", () => {
    expect(
      validateAdminRouteServerFileContents(
        "apps/admin-app/src/lib/example-route-server.ts",
        `
          import { decodeSyncBoundary } from "./effect-boundary";

          const AdminLoaderInputSchema = Schema.Struct({
            leaked: Schema.optional(Schema.String),
          });
          const decodeAdminLoaderInput = decodeSyncBoundary(AdminLoaderInputSchema);

          export const getData = createServerFn({ method: "GET" })
            .inputValidator((input: unknown) => {
              if (Math.random() > 0.5) {
                return decodeAdminLoaderInput(input);
              }

              return input as { readonly leaked?: string };
            });
        `,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "admin-route-server-input-validator-inline-decode",
        }),
      ]),
    );
  });

  it("rejects mixed decoded and raw boundary return values", () => {
    expect(
      validateAdminRouteServerFileContents(
        "apps/admin-app/src/lib/example-route-server.ts",
        `
          import { decodeSyncBoundary } from "./effect-boundary";

          const AdminLoaderInputSchema = Schema.Struct({
            query: Schema.optional(Schema.String),
            leaked: Schema.optional(Schema.String),
          });
          const decodeAdminLoaderInput = decodeSyncBoundary(AdminLoaderInputSchema);

          export const getData = createServerFn({ method: "GET" })
            .inputValidator((input: unknown) => {
              const decoded = decodeAdminLoaderInput(input);
              return {
                query: decoded.query,
                leaked: (input as { readonly leaked?: string }).leaked,
              };
            });
        `,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "admin-route-server-input-validator-inline-decode",
        }),
      ]),
    );
  });

  it("allows decode helper references", () => {
    expect(
      validateAdminRouteServerFileContents(
        "apps/admin-app/src/lib/example-route-server.ts",
        `
          import { decodeEmptyInput } from "./effect-boundary";

          export const getData = createServerFn({ method: "GET" })
            .inputValidator(decodeEmptyInput);
        `,
      ),
    ).toEqual([]);
  });

  it("allows decodeSyncBoundary call expressions", () => {
    expect(
      validateAdminRouteServerFileContents(
        "apps/admin-app/src/lib/example-route-server.ts",
        `
          import { decodeSyncBoundary } from "./effect-boundary";

          export const getData = createServerFn({ method: "GET" })
            .inputValidator(decodeSyncBoundary(AdminLoaderInputSchema));
        `,
      ),
    ).toEqual([]);
  });

  it("allows unknown -> decode -> normalize inline validators", () => {
    expect(
      validateAdminRouteServerFileContents(
        "apps/admin-app/src/lib/example-route-server.ts",
        `
          import { decodeSyncBoundary } from "./effect-boundary";

          const AdminLoaderInputSchema = Schema.Struct({
            query: Schema.optional(Schema.String),
          });
          const decodeAdminLoaderInput = decodeSyncBoundary(AdminLoaderInputSchema);
          const normalizeAdminLoaderInput = (input: { readonly query?: string }) =>
            input;

          export const getData = createServerFn({ method: "GET" })
            .inputValidator((input: unknown) =>
              normalizeAdminLoaderInput(decodeAdminLoaderInput(input)),
            );
        `,
      ),
    ).toEqual([]);
  });
});

describe("collectEffectBoundaryViolationFiles", () => {
  it("covers admin server-function mutation boundaries", () => {
    expect(collectEffectBoundaryViolationFiles()).toEqual(
      expect.arrayContaining([
        "apps/admin-app/src/lib/admin-members-mutations-server.ts",
        "apps/admin-app/src/lib/governance-config-mutations-server.ts",
        "apps/admin-app/src/lib/tenant-workspace-mutations-server.ts",
      ]),
    );
  });
});
