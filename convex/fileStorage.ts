import {
  dataClassification,
  managedFileUsage,
  platformScope,
  type FileStorageClassification,
  type ManagedFileUsage,
  type PlatformScope,
} from "@comvestec/contracts";
import { Effect } from "effect";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutationGeneric, queryGeneric } from "convex/server";
import { type GenericId, v } from "convex/values";
import {
  requireWorkflowActorIdentity,
  toWorkflowActorIdentityBoundaryError,
} from "./keycloakWorkflowIdentity";

type FileStorageRuntimeCtx = MutationCtx | QueryCtx;

const platformScopeValidator = v.union(
  v.literal(platformScope.platform),
  v.literal(platformScope.enterprise),
  v.literal(platformScope.organization),
  v.literal(platformScope.individual),
);

const fileStorageClassificationValues = [
  dataClassification.public,
  dataClassification.internal,
  dataClassification.tenantConfidential,
  dataClassification.regulatedSensitive,
] as const;

const fileStorageClassificationValidator = v.union(
  v.literal(dataClassification.public),
  v.literal(dataClassification.internal),
  v.literal(dataClassification.tenantConfidential),
  v.literal(dataClassification.regulatedSensitive),
);

const managedFileUsageValidator = v.union(
  v.literal(managedFileUsage.standard),
  v.literal(managedFileUsage.brandingAsset),
);

type ManagedFileRecord = {
  fileId: string;
  scope: PlatformScope;
  scopeId: string;
  storageId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  classification: FileStorageClassification;
  usage: ManagedFileUsage;
  uploadedBy: string;
  uploadedAt: string;
  deletedBy?: string;
  deletedAt?: string;
};

type ManagedFileRecordDocument = ManagedFileRecord & {
  _id: GenericId<"managedFiles">;
  _creationTime: number;
};

type ManagedFileUploadReservationDocument = {
  _id: GenericId<"managedFileUploadReservations">;
  _creationTime: number;
  uploadToken: string;
  scope: string;
  scopeId: string;
  uploadedBy: string;
  maxSizeBytes: number;
  expectedSha256: string;
  reservedAtMs: number;
  consumedByFileId?: string;
  consumedAtMs?: number;
};

type StoredFileMetadata = {
  _creationTime: number;
  sha256: string;
  size: number;
  contentType?: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === "string";

const isOptionalNumber = (value: unknown): value is number | undefined =>
  value === undefined || typeof value === "number";

const isPositiveIntegerByteCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const sha256HexPattern = /^[0-9a-f]{64}$/i;

const decodeHexSha256Digest = (value: string): Uint8Array | undefined => {
  const normalizedValue = value.trim();

  if (!sha256HexPattern.test(normalizedValue)) {
    return undefined;
  }

  const bytes = new Uint8Array(normalizedValue.length / 2);

  for (let index = 0; index < normalizedValue.length; index += 2) {
    const byte = Number.parseInt(normalizedValue.slice(index, index + 2), 16);

    if (!Number.isFinite(byte)) {
      return undefined;
    }

    bytes[index / 2] = byte;
  }

  return bytes;
};

const decodeBase64Sha256Digest = (value: string): Uint8Array | undefined => {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    return undefined;
  }

  const paddedValue = normalizedValue.padEnd(
    Math.ceil(normalizedValue.length / 4) * 4,
    "=",
  );

  try {
    const decodedValue = atob(paddedValue);

    return Uint8Array.from(decodedValue, (character) =>
      character.charCodeAt(0),
    );
  } catch {
    return undefined;
  }
};

const decodeSha256Digest = (value: string): Uint8Array | undefined => {
  const decodedHexDigest = decodeHexSha256Digest(value);

  if (decodedHexDigest !== undefined && decodedHexDigest.byteLength === 32) {
    return decodedHexDigest;
  }

  const decodedBase64Digest = decodeBase64Sha256Digest(value);

  return decodedBase64Digest !== undefined &&
    decodedBase64Digest.byteLength === 32
    ? decodedBase64Digest
    : undefined;
};

const sha256DigestsMatch = (input: {
  readonly expected: string;
  readonly actual: string;
}) => {
  const expectedDigest = decodeSha256Digest(input.expected);
  const actualDigest = decodeSha256Digest(input.actual);

  if (expectedDigest === undefined || actualDigest === undefined) {
    return input.expected.trim() === input.actual.trim();
  }

  return expectedDigest.every((byte, index) => byte === actualDigest[index]);
};

const isoTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;

const isLeapYear = (year: number) =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number) => {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
};

const isIsoTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }

  const match = isoTimestampPattern.exec(value);

  if (match == null) {
    return false;
  }

  const year = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  const day = Number.parseInt(match[3] ?? "", 10);
  const hour = Number.parseInt(match[4] ?? "", 10);
  const minute = Number.parseInt(match[5] ?? "", 10);
  const second = Number.parseInt(match[6] ?? "", 10);
  const offsetHour =
    match[9] == null ? undefined : Number.parseInt(match[9], 10);
  const offsetMinute =
    match[10] == null ? undefined : Number.parseInt(match[10], 10);

  if (month < 1 || month > 12) {
    return false;
  }

  if (day < 1 || day > daysInMonth(year, month)) {
    return false;
  }

  if (hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  if (
    offsetHour !== undefined &&
    offsetMinute !== undefined &&
    (offsetHour > 23 || offsetMinute > 59)
  ) {
    return false;
  }

  return true;
};

const isOptionalIsoTimestamp = (value: unknown): value is string | undefined =>
  value === undefined || isIsoTimestamp(value);

const isPlatformScopeValue = (value: unknown): value is PlatformScope =>
  typeof value === "string" &&
  [
    platformScope.platform,
    platformScope.enterprise,
    platformScope.organization,
    platformScope.individual,
  ].includes(value as PlatformScope);

const isFileStorageClassificationValue = (
  value: unknown,
): value is FileStorageClassification =>
  typeof value === "string" &&
  fileStorageClassificationValues.includes(value as FileStorageClassification);

const isManagedFileUsageValue = (value: unknown): value is ManagedFileUsage =>
  value === managedFileUsage.standard ||
  value === managedFileUsage.brandingAsset;

const isManagedFileRecordDocument = (
  candidate: unknown,
): candidate is ManagedFileRecordDocument =>
  isRecord(candidate) &&
  typeof candidate._id === "string" &&
  typeof candidate._creationTime === "number" &&
  typeof candidate.fileId === "string" &&
  isPlatformScopeValue(candidate.scope) &&
  typeof candidate.scopeId === "string" &&
  typeof candidate.storageId === "string" &&
  typeof candidate.fileName === "string" &&
  typeof candidate.contentType === "string" &&
  isPositiveIntegerByteCount(candidate.sizeBytes) &&
  isFileStorageClassificationValue(candidate.classification) &&
  isManagedFileUsageValue(candidate.usage) &&
  typeof candidate.uploadedBy === "string" &&
  isIsoTimestamp(candidate.uploadedAt) &&
  isOptionalString(candidate.deletedBy) &&
  isOptionalIsoTimestamp(candidate.deletedAt);

const isManagedFileUploadReservationDocument = (
  candidate: unknown,
): candidate is ManagedFileUploadReservationDocument =>
  isRecord(candidate) &&
  typeof candidate._id === "string" &&
  typeof candidate._creationTime === "number" &&
  typeof candidate.uploadToken === "string" &&
  typeof candidate.scope === "string" &&
  typeof candidate.scopeId === "string" &&
  typeof candidate.uploadedBy === "string" &&
  isPositiveIntegerByteCount(candidate.maxSizeBytes) &&
  typeof candidate.expectedSha256 === "string" &&
  typeof candidate.reservedAtMs === "number" &&
  isOptionalString(candidate.consumedByFileId) &&
  isOptionalNumber(candidate.consumedAtMs);

const isStoredFileMetadata = (
  candidate: unknown,
): candidate is StoredFileMetadata =>
  isRecord(candidate) &&
  typeof candidate._creationTime === "number" &&
  typeof candidate.sha256 === "string" &&
  isPositiveIntegerByteCount(candidate.size) &&
  (candidate.contentType === undefined ||
    candidate.contentType === null ||
    typeof candidate.contentType === "string");

const ensurePositiveIntegerByteCount = (
  value: number,
  errorMessage: string,
) => {
  if (!isPositiveIntegerByteCount(value)) {
    throw new Error(errorMessage);
  }
};

const ensureIsoTimestamp = (value: string, errorMessage: string) => {
  if (!isIsoTimestamp(value)) {
    throw new Error(errorMessage);
  }
};

const managedFileRecordValidator = v.object({
  fileId: v.string(),
  scope: platformScopeValidator,
  scopeId: v.string(),
  storageId: v.string(),
  fileName: v.string(),
  contentType: v.string(),
  sizeBytes: v.float64(),
  classification: fileStorageClassificationValidator,
  usage: managedFileUsageValidator,
  uploadedBy: v.string(),
  uploadedAt: v.string(),
  deletedBy: v.optional(v.string()),
  deletedAt: v.optional(v.string()),
});

const managedFileUploadReservationValidator = v.object({
  uploadToken: v.string(),
  scope: platformScopeValidator,
  scopeId: v.string(),
  uploadedBy: v.string(),
  maxSizeBytes: v.float64(),
  expectedSha256: v.string(),
  reservedAtMs: v.float64(),
  consumedByFileId: v.optional(v.string()),
  consumedAtMs: v.optional(v.float64()),
});

const createManagedFileRecordValidator = v.object({
  ...managedFileRecordValidator.fields,
  uploadToken: v.string(),
});

const ensureFileStorageIdentity = async (
  ctx: FileStorageRuntimeCtx,
  operation: string,
) => {
  await Effect.runPromise(
    Effect.promise(() => ctx.auth.getUserIdentity()).pipe(
      Effect.flatMap((identity) =>
        requireWorkflowActorIdentity(identity, operation),
      ),
      Effect.mapError(toWorkflowActorIdentityBoundaryError),
    ),
  );
};

const toManagedFileRecord = (
  document: ManagedFileRecordDocument,
): ManagedFileRecord => {
  const { _id, _creationTime, ...record } = document;

  return record;
};

const stripManagedFileDocument = (
  document: ManagedFileRecordDocument | null,
): ManagedFileRecord | null => {
  if (document === null) {
    return null;
  }

  return toManagedFileRecord(document);
};

const findManagedFileDocumentById = async (
  ctx: FileStorageRuntimeCtx,
  fileId: string,
): Promise<ManagedFileRecordDocument | null> => {
  const records = await ctx.db
    .query("managedFiles")
    .filter((query) => query.eq(query.field("fileId"), fileId))
    .collect();

  return (
    records.find(
      (candidate): candidate is ManagedFileRecordDocument =>
        isManagedFileRecordDocument(candidate) && candidate.fileId === fileId,
    ) ?? null
  );
};

const findManagedFileUploadReservationByToken = async (
  ctx: FileStorageRuntimeCtx,
  uploadToken: string,
): Promise<ManagedFileUploadReservationDocument | null> => {
  const reservations = await ctx.db
    .query("managedFileUploadReservations")
    .filter((query) => query.eq(query.field("uploadToken"), uploadToken))
    .collect();

  return (
    reservations.find(
      (candidate): candidate is ManagedFileUploadReservationDocument =>
        isManagedFileUploadReservationDocument(candidate) &&
        candidate.uploadToken === uploadToken,
    ) ?? null
  );
};

const findManagedFileDocumentByStorageId = async (
  ctx: FileStorageRuntimeCtx,
  storageId: string,
): Promise<ManagedFileRecordDocument | null> => {
  const records = await ctx.db
    .query("managedFiles")
    .filter((query) => query.eq(query.field("storageId"), storageId))
    .collect();

  return (
    records.find(
      (candidate): candidate is ManagedFileRecordDocument =>
        isManagedFileRecordDocument(candidate) &&
        candidate.storageId === storageId,
    ) ?? null
  );
};

export const generateManagedFileUploadUrl = mutationGeneric({
  args: {
    scope: platformScopeValidator,
    scopeId: v.string(),
    uploadedBy: v.string(),
    maxSizeBytes: v.float64(),
    expectedSha256: v.string(),
  },
  returns: v.object({
    uploadUrl: v.string(),
    uploadToken: v.string(),
  }),
  handler: async (ctx, args) => {
    await ensureFileStorageIdentity(ctx, "File storage upload URL generation");
    ensurePositiveIntegerByteCount(
      args.maxSizeBytes,
      "Managed file upload reservations require a positive integer byte limit.",
    );

    const uploadToken = crypto.randomUUID();

    await ctx.db.insert("managedFileUploadReservations", {
      uploadToken,
      scope: args.scope,
      scopeId: args.scopeId,
      uploadedBy: args.uploadedBy,
      maxSizeBytes: args.maxSizeBytes,
      expectedSha256: args.expectedSha256,
      reservedAtMs: Date.now(),
    });

    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
      uploadToken,
    };
  },
});

export const createManagedFileRecord = mutationGeneric({
  args: createManagedFileRecordValidator.fields,
  returns: managedFileRecordValidator,
  handler: async (ctx, args) => {
    await ensureFileStorageIdentity(ctx, "File storage record creation");
    ensurePositiveIntegerByteCount(
      args.sizeBytes,
      "Managed file registration requires a positive integer byte count.",
    );
    ensureIsoTimestamp(
      args.uploadedAt,
      "Managed file registration requires an ISO timestamp for uploadedAt.",
    );
    if (args.deletedAt !== undefined) {
      ensureIsoTimestamp(
        args.deletedAt,
        "Managed file registration requires an ISO timestamp for deletedAt.",
      );
    }

    const reservation = await findManagedFileUploadReservationByToken(
      ctx,
      args.uploadToken,
    );

    if (reservation === null || reservation.consumedAtMs !== undefined) {
      throw new Error("Managed file upload token is invalid or already used.");
    }

    if (
      reservation.scope !== args.scope ||
      reservation.scopeId !== args.scopeId ||
      reservation.uploadedBy !== args.uploadedBy
    ) {
      throw new Error(
        "Managed file upload token does not match the target scope or actor.",
      );
    }

    const storageMetadata = await ctx.db.system.get(
      "_storage",
      args.storageId as never,
    );

    if (storageMetadata === null) {
      throw new Error("Managed file upload blob was not found.");
    }

    if (!isStoredFileMetadata(storageMetadata)) {
      throw new Error("Managed file upload blob metadata is invalid.");
    }

    if (storageMetadata._creationTime < reservation.reservedAtMs) {
      throw new Error(
        "Managed file upload blob predates the issued upload reservation.",
      );
    }

    if (
      !sha256DigestsMatch({
        expected: reservation.expectedSha256,
        actual: storageMetadata.sha256,
      })
    ) {
      throw new Error(
        "Managed file upload blob digest does not match the issued upload reservation.",
      );
    }

    const existingStorageBinding = await findManagedFileDocumentByStorageId(
      ctx,
      args.storageId,
    );

    if (existingStorageBinding !== null) {
      throw new Error(
        "Managed file upload blob is already bound to a file record.",
      );
    }

    if (storageMetadata.size > reservation.maxSizeBytes) {
      throw new Error("Managed file upload exceeds the reserved size limit.");
    }

    ensurePositiveIntegerByteCount(
      storageMetadata.size,
      "Managed file upload blob size must be a positive integer.",
    );

    const { uploadToken: _uploadToken, ...record } = {
      ...args,
      sizeBytes: storageMetadata.size,
      contentType: storageMetadata.contentType ?? args.contentType,
    };

    await ctx.db.insert("managedFiles", record);

    await ctx.db.patch(reservation._id, {
      consumedByFileId: record.fileId,
      consumedAtMs: Date.now(),
    });

    return record;
  },
});

export const getManagedFileRecord = queryGeneric({
  args: {
    fileId: v.string(),
  },
  returns: v.union(managedFileRecordValidator, v.null()),
  handler: async (ctx, args) => {
    await ensureFileStorageIdentity(ctx, "File storage record lookup");

    return stripManagedFileDocument(
      await findManagedFileDocumentById(ctx, args.fileId),
    );
  },
});

export const listManagedFileRecords = queryGeneric({
  args: {
    scope: platformScopeValidator,
    scopeId: v.string(),
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.array(managedFileRecordValidator),
  handler: async (ctx, args) => {
    await ensureFileStorageIdentity(ctx, "File storage record list");

    const records = await ctx.db
      .query("managedFiles")
      .filter((query) =>
        query.and(
          query.eq(query.field("scope"), args.scope),
          query.eq(query.field("scopeId"), args.scopeId),
        ),
      )
      .collect();

    return records
      .filter(isManagedFileRecordDocument)
      .filter((record) =>
        args.includeDeleted === true ? true : record.deletedAt === undefined,
      )
      .map((record) => toManagedFileRecord(record));
  },
});

export const resolveStoredFileUrl = queryGeneric({
  args: {
    storageId: v.string(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    await ensureFileStorageIdentity(ctx, "File storage URL resolution");

    return await ctx.storage.getUrl(args.storageId as never);
  },
});

export const markManagedFileDeleted = mutationGeneric({
  args: {
    fileId: v.string(),
    deletedBy: v.string(),
    deletedAt: v.string(),
  },
  returns: v.union(managedFileRecordValidator, v.null()),
  handler: async (ctx, args) => {
    await ensureFileStorageIdentity(ctx, "File storage record deletion mark");
    ensureIsoTimestamp(
      args.deletedAt,
      "Managed file deletion requires an ISO timestamp for deletedAt.",
    );

    const existingRecord = await findManagedFileDocumentById(ctx, args.fileId);

    if (existingRecord === null) {
      return null;
    }

    await ctx.db.patch(existingRecord._id, {
      deletedBy: args.deletedBy,
      deletedAt: args.deletedAt,
    });

    return stripManagedFileDocument({
      ...existingRecord,
      deletedBy: args.deletedBy,
      deletedAt: args.deletedAt,
    });
  },
});

export const deleteStoredFileBlob = mutationGeneric({
  args: {
    storageId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureFileStorageIdentity(ctx, "File storage blob deletion");

    await ctx.storage.delete(args.storageId as never);

    return null;
  },
});
