import { Schema } from "effect";
import { PlatformScopeSchema } from "@comvestec/contracts";

export const PlatformStorageSchema = Schema.Struct({
  primaryAppState: Schema.Literal("convex"),
  systemRecords: Schema.Literal("postgresql"),
  fileStorage: Schema.Literal("convex"),
});

const PlatformTenancySchema = Schema.Struct({
  scopes: Schema.Array(PlatformScopeSchema),
});

const PlatformSecuritySchema = Schema.Struct({
  fieldLevelAccess: Schema.Boolean,
  sensitiveReadAudit: Schema.Boolean,
  auditPermissionChanges: Schema.Boolean,
});

export const PlatformDefaultsSchema = Schema.Struct({
  architecture: Schema.Literal("modular-monolith"),
  runtime: Schema.Literal("effect"),
  storage: PlatformStorageSchema,
  tenancy: PlatformTenancySchema,
  security: PlatformSecuritySchema,
});

export type PlatformDefaults = Schema.Schema.Type<
  typeof PlatformDefaultsSchema
>;

export const platformDefaults = Schema.validateSync(PlatformDefaultsSchema)({
  architecture: "modular-monolith",
  runtime: "effect",
  storage: {
    primaryAppState: "convex",
    systemRecords: "postgresql",
    fileStorage: "convex",
  },
  tenancy: {
    scopes: ["platform", "enterprise", "organization", "individual"],
  },
  security: {
    fieldLevelAccess: true,
    sensitiveReadAudit: true,
    auditPermissionChanges: true,
  },
} satisfies PlatformDefaults);
