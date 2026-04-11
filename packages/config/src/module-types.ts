import { Schema } from "effect";
import {
  ModuleConfigManifestSchema,
  PlatformModuleIdSchema as SharedPlatformModuleIdSchema,
} from "@comvestec/contracts";

export const PlatformModuleIdSchema = SharedPlatformModuleIdSchema;

export type PlatformModuleId = Schema.Schema.Type<
  typeof PlatformModuleIdSchema
>;

export const PlatformModuleManifestSchema = ModuleConfigManifestSchema;

export type PlatformModuleManifest = Schema.Schema.Type<
  typeof PlatformModuleManifestSchema
>;

export const PlatformModuleManifestListSchema = Schema.Array(
  PlatformModuleManifestSchema,
);
