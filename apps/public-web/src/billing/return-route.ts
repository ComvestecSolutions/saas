import { createObservedPlatformRequestBoundary } from "@comvestec/platform";

export type PublicWebBillingReturnKind = "success" | "cancel";

const publicWebBillingReturnTelemetryServiceName: Record<
  PublicWebBillingReturnKind,
  string
> = {
  success: "public-web-billing-return-success",
  cancel: "public-web-billing-return-cancel",
};

const buildPublicWebBillingReturnUnhandledErrorResponse = (input: {
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) =>
  Response.json(
    { error: "Public billing return failed." },
    {
      status: 500,
      headers: {
        [input.correlationHeaderName]: input.correlationId,
      },
    },
  );

export const handlePublicWebBillingReturnRequest = (
  environment: unknown,
  request: Request,
  kind: PublicWebBillingReturnKind,
) => {
  const requestBoundary = createObservedPlatformRequestBoundary({
    environment,
    serviceName: publicWebBillingReturnTelemetryServiceName[kind],
    buildUnhandledErrorResponse:
      buildPublicWebBillingReturnUnhandledErrorResponse,
  });

  return requestBoundary.wrap((currentRequest) =>
    Promise.resolve(
      Response.redirect(new URL("/", currentRequest.url).toString(), 302),
    ),
  )(request);
};
