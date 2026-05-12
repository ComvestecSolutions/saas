import { Effect } from "effect";
import type {
  DismissCurrentActorInAppNotificationRequest,
  ListCurrentActorInAppNotificationsRequest,
  MarkCurrentActorInAppNotificationReadRequest,
} from "../communication/notification-center-in-app";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

const loadNotificationCenterInAppRuntime = () =>
  loadRuntimeModuleOrDie(
    () => import("../communication/notification-center-in-app"),
  );

export const listCurrentActorInAppNotificationsFromEnvironment = (
  environment: unknown,
  input: ListCurrentActorInAppNotificationsRequest,
) =>
  loadNotificationCenterInAppRuntime().pipe(
    Effect.flatMap(({ runNotificationCenterInAppFromEnvironment }) =>
      runNotificationCenterInAppFromEnvironment(environment, (service) =>
        service.listCurrentActorInAppNotifications(input),
      ),
    ),
  );

type ListCurrentActorInAppNotifications = (
  input: ListCurrentActorInAppNotificationsRequest,
) => ReturnType<typeof listCurrentActorInAppNotificationsFromEnvironment>;

export const listCurrentActorInAppNotificationsFromRequestContext = (
  environment: unknown,
  input: ListCurrentActorInAppNotificationsRequest,
  listCurrentActorInAppNotifications: ListCurrentActorInAppNotifications = (
    requestInput,
  ) =>
    listCurrentActorInAppNotificationsFromEnvironment(
      environment,
      requestInput,
    ),
) => listCurrentActorInAppNotifications(input);

export const markCurrentActorInAppNotificationReadFromEnvironment = (
  environment: unknown,
  input: MarkCurrentActorInAppNotificationReadRequest,
) =>
  loadNotificationCenterInAppRuntime().pipe(
    Effect.flatMap(({ runNotificationCenterInAppFromEnvironment }) =>
      runNotificationCenterInAppFromEnvironment(environment, (service) =>
        service.markCurrentActorInAppNotificationRead(input),
      ),
    ),
  );

type MarkCurrentActorInAppNotificationRead = (
  input: MarkCurrentActorInAppNotificationReadRequest,
) => ReturnType<typeof markCurrentActorInAppNotificationReadFromEnvironment>;

export const markCurrentActorInAppNotificationReadFromRequestContext = (
  environment: unknown,
  input: MarkCurrentActorInAppNotificationReadRequest,
  markCurrentActorInAppNotificationRead: MarkCurrentActorInAppNotificationRead = (
    requestInput,
  ) =>
    markCurrentActorInAppNotificationReadFromEnvironment(
      environment,
      requestInput,
    ),
) => markCurrentActorInAppNotificationRead(input);

export const dismissCurrentActorInAppNotificationFromEnvironment = (
  environment: unknown,
  input: DismissCurrentActorInAppNotificationRequest,
) =>
  loadNotificationCenterInAppRuntime().pipe(
    Effect.flatMap(({ runNotificationCenterInAppFromEnvironment }) =>
      runNotificationCenterInAppFromEnvironment(environment, (service) =>
        service.dismissCurrentActorInAppNotification(input),
      ),
    ),
  );

type DismissCurrentActorInAppNotification = (
  input: DismissCurrentActorInAppNotificationRequest,
) => ReturnType<typeof dismissCurrentActorInAppNotificationFromEnvironment>;

export const dismissCurrentActorInAppNotificationFromRequestContext = (
  environment: unknown,
  input: DismissCurrentActorInAppNotificationRequest,
  dismissCurrentActorInAppNotification: DismissCurrentActorInAppNotification = (
    requestInput,
  ) =>
    dismissCurrentActorInAppNotificationFromEnvironment(
      environment,
      requestInput,
    ),
) => dismissCurrentActorInAppNotification(input);
