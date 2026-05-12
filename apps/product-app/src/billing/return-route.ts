import { createObservedPlatformRequestBoundary } from "@comvestec/platform";

export type ProductBillingReturnKind = "success" | "cancel";

const productBillingReturnTelemetryServiceName: Record<
  ProductBillingReturnKind,
  string
> = {
  success: "product-app-billing-return-success",
  cancel: "product-app-billing-return-cancel",
};

const buildBillingReturnUnhandledErrorResponse = (input: {
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) =>
  Response.json(
    { error: "Product billing return failed." },
    {
      status: 500,
      headers: {
        [input.correlationHeaderName]: input.correlationId,
      },
    },
  );

export const handleProductBillingReturnRequest = (
  environment: unknown,
  request: Request,
  kind: ProductBillingReturnKind,
) => {
  const requestBoundary = createObservedPlatformRequestBoundary({
    environment,
    serviceName: productBillingReturnTelemetryServiceName[kind],
    buildUnhandledErrorResponse: buildBillingReturnUnhandledErrorResponse,
  });

  return requestBoundary.wrap((currentRequest) =>
    Promise.resolve(
      Response.redirect(new URL("/", currentRequest.url).toString(), 302),
    ),
  )(request);
};
