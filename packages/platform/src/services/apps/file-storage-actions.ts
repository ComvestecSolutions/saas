import { Effect } from "effect";
import type {
  ManagedFileByRequestLookup,
  ListManagedFilesByRequest,
  RegisterManagedFileByRequest,
  RequestManagedFileUploadUrlRequest,
} from "../domains/file-storage";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

const loadFileStorageRuntime = () =>
  loadRuntimeModuleOrDie(() => import("../domains/file-storage"));

export const requestManagedFileUploadUrlFromEnvironment = (
  environment: unknown,
  input: RequestManagedFileUploadUrlRequest,
) =>
  loadFileStorageRuntime().pipe(
    Effect.flatMap(({ runFileStorageFromEnvironment }) =>
      runFileStorageFromEnvironment(environment, (service) =>
        service.requestManagedFileUploadUrl(input),
      ),
    ),
  );

type RequestManagedFileUploadUrl = (
  input: RequestManagedFileUploadUrlRequest,
) => ReturnType<typeof requestManagedFileUploadUrlFromEnvironment>;

export const requestManagedFileUploadUrlFromRequestContext = (
  environment: unknown,
  input: RequestManagedFileUploadUrlRequest,
  requestManagedFileUploadUrl: RequestManagedFileUploadUrl = (requestInput) =>
    requestManagedFileUploadUrlFromEnvironment(environment, requestInput),
) => requestManagedFileUploadUrl(input);

export const registerManagedFileFromEnvironment = (
  environment: unknown,
  input: RegisterManagedFileByRequest,
) =>
  loadFileStorageRuntime().pipe(
    Effect.flatMap(({ runFileStorageFromEnvironment }) =>
      runFileStorageFromEnvironment(environment, (service) =>
        service.registerManagedFile(input),
      ),
    ),
  );

type RegisterManagedFile = (
  input: RegisterManagedFileByRequest,
) => ReturnType<typeof registerManagedFileFromEnvironment>;

export const registerManagedFileFromRequestContext = (
  environment: unknown,
  input: RegisterManagedFileByRequest,
  registerManagedFile: RegisterManagedFile = (requestInput) =>
    registerManagedFileFromEnvironment(environment, requestInput),
) => registerManagedFile(input);

export const listManagedFilesFromEnvironment = (
  environment: unknown,
  input: ListManagedFilesByRequest,
) =>
  loadFileStorageRuntime().pipe(
    Effect.flatMap(({ runFileStorageFromEnvironment }) =>
      runFileStorageFromEnvironment(environment, (service) =>
        service.listManagedFiles(input),
      ),
    ),
  );

type ListManagedFiles = (
  input: ListManagedFilesByRequest,
) => ReturnType<typeof listManagedFilesFromEnvironment>;

export const listManagedFilesFromRequestContext = (
  environment: unknown,
  input: ListManagedFilesByRequest,
  listManagedFiles: ListManagedFiles = (requestInput) =>
    listManagedFilesFromEnvironment(environment, requestInput),
) => listManagedFiles(input);

export const resolveManagedFileDownloadFromEnvironment = (
  environment: unknown,
  input: ManagedFileByRequestLookup,
) =>
  loadFileStorageRuntime().pipe(
    Effect.flatMap(({ runFileStorageFromEnvironment }) =>
      runFileStorageFromEnvironment(environment, (service) =>
        service.resolveManagedFileDownload(input),
      ),
    ),
  );

type ResolveManagedFileDownload = (
  input: ManagedFileByRequestLookup,
) => ReturnType<typeof resolveManagedFileDownloadFromEnvironment>;

export const resolveManagedFileDownloadFromRequestContext = (
  environment: unknown,
  input: ManagedFileByRequestLookup,
  resolveManagedFileDownload: ResolveManagedFileDownload = (requestInput) =>
    resolveManagedFileDownloadFromEnvironment(environment, requestInput),
) => resolveManagedFileDownload(input);

export const deleteManagedFileFromEnvironment = (
  environment: unknown,
  input: ManagedFileByRequestLookup,
) =>
  loadFileStorageRuntime().pipe(
    Effect.flatMap(({ runFileStorageFromEnvironment }) =>
      runFileStorageFromEnvironment(environment, (service) =>
        service.deleteManagedFile(input),
      ),
    ),
  );

type DeleteManagedFile = (
  input: ManagedFileByRequestLookup,
) => ReturnType<typeof deleteManagedFileFromEnvironment>;

export const deleteManagedFileFromRequestContext = (
  environment: unknown,
  input: ManagedFileByRequestLookup,
  deleteManagedFile: DeleteManagedFile = (requestInput) =>
    deleteManagedFileFromEnvironment(environment, requestInput),
) => deleteManagedFile(input);
