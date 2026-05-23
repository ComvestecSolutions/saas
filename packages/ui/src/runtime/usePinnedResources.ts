import { useCallback, useEffect, useState } from "react";

/**
 * A single resource pinned to the Operator Desk Left Edge Rail.
 *
 * Resources are addressed by `(resource, id?)` matching the workbench
 * URL grammar (`tenant:abc`, `runs`, `incidents`, etc.). The rail is
 * a dock, not a navigation menu — pins are user-owned.
 */
export type PinnedResource = {
  readonly resource: string;
  readonly id?: string;
  readonly label: string;
};

const STORAGE_KEY = "ops-desk:pinned-resources@v1";

const readStorage = (
  storage: Storage | undefined,
): readonly PinnedResource[] => {
  if (storage === undefined) return [];
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: PinnedResource[] = [];
    for (const candidate of parsed) {
      if (typeof candidate !== "object" || candidate === null) continue;
      const record = candidate as Record<string, unknown>;
      const resource = record["resource"];
      const label = record["label"];
      const id = record["id"];
      if (typeof resource !== "string" || typeof label !== "string") continue;
      const pin: PinnedResource =
        typeof id === "string" ? { resource, id, label } : { resource, label };
      result.push(pin);
    }
    return result;
  } catch {
    return [];
  }
};

const writeStorage = (
  storage: Storage | undefined,
  next: readonly PinnedResource[],
): void => {
  if (storage === undefined) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
};

const samePin = (a: PinnedResource, b: PinnedResource): boolean =>
  a.resource === b.resource && (a.id ?? "") === (b.id ?? "");

export type UsePinnedResourcesOptions = {
  /**
   * Storage adapter; defaults to `window.localStorage` when present.
   * Tests pass an in-memory shim so each suite stays isolated.
   */
  readonly storage?: Storage;
};

export type UsePinnedResourcesResult = {
  readonly pins: readonly PinnedResource[];
  readonly pin: (resource: PinnedResource) => void;
  readonly unpin: (resource: Pick<PinnedResource, "resource" | "id">) => void;
  readonly isPinned: (
    resource: Pick<PinnedResource, "resource" | "id">,
  ) => boolean;
};

export const usePinnedResources = (
  options: UsePinnedResourcesOptions = {},
): UsePinnedResourcesResult => {
  const storage =
    options.storage ??
    (typeof window === "undefined" ? undefined : window.localStorage);
  const [pins, setPins] = useState<readonly PinnedResource[]>(() =>
    readStorage(storage),
  );

  useEffect(() => {
    writeStorage(storage, pins);
  }, [storage, pins]);

  const pin = useCallback((resource: PinnedResource) => {
    setPins((current) => {
      if (current.some((entry) => samePin(entry, resource))) return current;
      return [...current, resource];
    });
  }, []);

  const unpin = useCallback(
    (resource: Pick<PinnedResource, "resource" | "id">) => {
      setPins((current) =>
        current.filter(
          (entry) =>
            !samePin(entry, {
              resource: resource.resource,
              ...(resource.id !== undefined ? { id: resource.id } : {}),
              label: "",
            }),
        ),
      );
    },
    [],
  );

  const isPinned = useCallback(
    (resource: Pick<PinnedResource, "resource" | "id">) =>
      pins.some((entry) =>
        samePin(entry, {
          resource: resource.resource,
          ...(resource.id !== undefined ? { id: resource.id } : {}),
          label: "",
        }),
      ),
    [pins],
  );

  return { pins, pin, unpin, isPinned };
};
