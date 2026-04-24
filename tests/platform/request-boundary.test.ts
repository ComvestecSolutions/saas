import {
  createPlatformRequestBoundary,
  platformRequestCorrelationIdHeaderName,
} from "@comvestec/platform";

describe("platform request boundary", () => {
  it("falls back to a generated correlation id when a resolver throws", async () => {
    const boundary = createPlatformRequestBoundary({
      resolveCorrelationId: async () => {
        throw new Error("resolver boom");
      },
    });

    const response = await boundary.wrap((request) =>
      Response.json({
        correlationId: request.headers.get(
          platformRequestCorrelationIdHeaderName,
        ),
      }),
    )(new Request("http://localhost/request-boundary"));

    const body = (await response.json()) as {
      readonly correlationId?: string;
    };

    expect(response.status).toBe(200);
    expect(
      response.headers.get(platformRequestCorrelationIdHeaderName),
    ).toEqual(expect.any(String));
    expect(body).toEqual({
      correlationId: response.headers.get(
        platformRequestCorrelationIdHeaderName,
      ),
    });
  });
});
