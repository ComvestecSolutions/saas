import type { PlatformModuleId } from "../module-registry/modules";

export const defineModuleAuditActions = <
  const TModule extends PlatformModuleId,
  const TSuffixes extends Record<string, string>,
>(
  moduleId: TModule,
  suffixes: TSuffixes,
): {
  readonly [K in keyof TSuffixes]: `${TModule}.${TSuffixes[K] & string}`;
} => {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(suffixes)) {
    result[k] = `${moduleId}.${v}`;
  }
  return result as never;
};
