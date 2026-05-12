import { Schema } from "effect";
import { PlatformScopeSchema } from "../access/platform-scopes";
import { dataClassification } from "../data/data-classifications";
import { IsoTimestampSchema } from "../runtime/timestamps";

const ManagedFileUsageConstantSchema = Schema.Struct({
  standard: Schema.Literal("standard"),
  brandingAsset: Schema.Literal("branding-asset"),
});

export const managedFileUsage = Schema.validateSync(
  ManagedFileUsageConstantSchema,
)({
  standard: "standard",
  brandingAsset: "branding-asset",
} satisfies Schema.Schema.Type<typeof ManagedFileUsageConstantSchema>);

export const managedFileUsages = [
  managedFileUsage.standard,
  managedFileUsage.brandingAsset,
] as const;

export const ManagedFileUsageSchema = Schema.Literal(...managedFileUsages);

export type ManagedFileUsage = Schema.Schema.Type<
  typeof ManagedFileUsageSchema
>;

export const FileStorageClassificationSchema = Schema.Literal(
  dataClassification.public,
  dataClassification.internal,
  dataClassification.tenantConfidential,
  dataClassification.regulatedSensitive,
);

export type FileStorageClassification = Schema.Schema.Type<
  typeof FileStorageClassificationSchema
>;

export const FileSizeBytesSchema = Schema.Number.pipe(
  Schema.filter((value) => Number.isInteger(value) && value > 0),
);

export type FileSizeBytes = Schema.Schema.Type<typeof FileSizeBytesSchema>;

const ManagedFileBaseFields = {
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  storageId: Schema.NonEmptyString,
  fileName: Schema.NonEmptyString,
  contentType: Schema.NonEmptyString,
  sizeBytes: FileSizeBytesSchema,
  classification: FileStorageClassificationSchema,
  usage: ManagedFileUsageSchema,
};

export const ManagedFileRecordSchema = Schema.Struct({
  fileId: Schema.NonEmptyString,
  ...ManagedFileBaseFields,
  uploadedBy: Schema.NonEmptyString,
  uploadedAt: IsoTimestampSchema,
  deletedBy: Schema.optional(Schema.NonEmptyString),
  deletedAt: Schema.optional(IsoTimestampSchema),
});

export type ManagedFileRecord = Schema.Schema.Type<
  typeof ManagedFileRecordSchema
>;

export const ManagedFileRecordListSchema = Schema.Array(
  ManagedFileRecordSchema,
);

export type ManagedFileRecordList = Schema.Schema.Type<
  typeof ManagedFileRecordListSchema
>;

export const ManagedFileUploadReservationRequestSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  uploadedBy: Schema.NonEmptyString,
  maxSizeBytes: FileSizeBytesSchema,
  expectedSha256: Schema.NonEmptyString,
});

export type ManagedFileUploadReservationRequest = Schema.Schema.Type<
  typeof ManagedFileUploadReservationRequestSchema
>;

export const RegisterManagedFileInputSchema = Schema.Struct({
  ...ManagedFileBaseFields,
  uploadToken: Schema.NonEmptyString,
  uploadedBy: Schema.NonEmptyString,
});

export type RegisterManagedFileInput = Schema.Schema.Type<
  typeof RegisterManagedFileInputSchema
>;

export const CreateManagedFileRecordInputSchema = Schema.Struct({
  fileId: Schema.NonEmptyString,
  ...ManagedFileBaseFields,
  uploadToken: Schema.NonEmptyString,
  uploadedBy: Schema.NonEmptyString,
  uploadedAt: IsoTimestampSchema,
});

export type CreateManagedFileRecordInput = Schema.Schema.Type<
  typeof CreateManagedFileRecordInputSchema
>;

export const ManagedFileLookupInputSchema = Schema.Struct({
  fileId: Schema.NonEmptyString,
});

export type ManagedFileLookupInput = Schema.Schema.Type<
  typeof ManagedFileLookupInputSchema
>;

export const StoredFileBlobLookupInputSchema = Schema.Struct({
  storageId: Schema.NonEmptyString,
});

export type StoredFileBlobLookupInput = Schema.Schema.Type<
  typeof StoredFileBlobLookupInputSchema
>;

export const ManagedFileUploadUrlSchema = Schema.Struct({
  uploadUrl: Schema.NonEmptyString,
  uploadToken: Schema.NonEmptyString,
});

export type ManagedFileUploadUrl = Schema.Schema.Type<
  typeof ManagedFileUploadUrlSchema
>;

export const ListManagedFilesRequestSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  includeDeleted: Schema.optional(Schema.Boolean),
});

export type ListManagedFilesRequest = Schema.Schema.Type<
  typeof ListManagedFilesRequestSchema
>;

const ManagedFileViewBaseFields = {
  fileId: Schema.NonEmptyString,
  fileName: Schema.NonEmptyString,
  contentType: Schema.NonEmptyString,
  sizeBytes: FileSizeBytesSchema,
};

export const ManagedFileSummaryViewSchema = Schema.Struct({
  ...ManagedFileViewBaseFields,
  deletedAt: Schema.optional(IsoTimestampSchema),
});

export type ManagedFileSummaryView = Schema.Schema.Type<
  typeof ManagedFileSummaryViewSchema
>;

export const ManagedFileSummaryViewListSchema = Schema.Array(
  ManagedFileSummaryViewSchema,
);

export type ManagedFileSummaryViewList = Schema.Schema.Type<
  typeof ManagedFileSummaryViewListSchema
>;

export const ManagedFileAdminViewSchema = Schema.Struct({
  ...ManagedFileViewBaseFields,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  uploadedBy: Schema.NonEmptyString,
  deletedAt: Schema.optional(IsoTimestampSchema),
  legalHoldActive: Schema.Boolean,
});

export type ManagedFileAdminView = Schema.Schema.Type<
  typeof ManagedFileAdminViewSchema
>;

export const ManagedFileAdminViewListSchema = Schema.Array(
  ManagedFileAdminViewSchema,
);

export type ManagedFileAdminViewList = Schema.Schema.Type<
  typeof ManagedFileAdminViewListSchema
>;

export const ManagedFileDownloadDescriptorSchema = Schema.Struct({
  file: ManagedFileSummaryViewSchema,
  downloadUrl: Schema.NonEmptyString,
});

export type ManagedFileDownloadDescriptor = Schema.Schema.Type<
  typeof ManagedFileDownloadDescriptorSchema
>;

export const DeleteManagedFileInputSchema = Schema.Struct({
  fileId: Schema.NonEmptyString,
  deletedBy: Schema.NonEmptyString,
});

export type DeleteManagedFileInput = Schema.Schema.Type<
  typeof DeleteManagedFileInputSchema
>;

export const MarkManagedFileDeletedInputSchema = Schema.Struct({
  fileId: Schema.NonEmptyString,
  deletedBy: Schema.NonEmptyString,
  deletedAt: IsoTimestampSchema,
});

export type MarkManagedFileDeletedInput = Schema.Schema.Type<
  typeof MarkManagedFileDeletedInputSchema
>;
