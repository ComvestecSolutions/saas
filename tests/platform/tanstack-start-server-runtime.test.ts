import { describe, expect, it } from "vitest";
import { subscriberJourneySessionCookieName } from "@comvestec/platform";
import { resolveSsrRequestContextRequest } from "../../apps/admin-app/src/lib/tanstack-start-server-runtime";

describe("tanstack start server runtime", () => {
  it("falls back to the h3 event request when the current context request is missing", () => {
    const h3EventRequest = new Request("http://localhost:3004/", {
      headers: {
        cookie: `${subscriberJourneySessionCookieName}=sess_admin_ssr`,
      },
    });

    expect(
      resolveSsrRequestContextRequest({
        h3EventRequest,
      }),
    ).toBe(h3EventRequest);
  });

  it("prefers the h3 event request when the current context request has no session cookie", () => {
    const contextRequest = new Request("http://localhost:3004/_server-fn");
    const h3EventRequest = new Request("http://localhost:3004/", {
      headers: {
        cookie: `${subscriberJourneySessionCookieName}=sess_admin_ssr`,
      },
    });

    expect(
      resolveSsrRequestContextRequest({
        contextRequest,
        h3EventRequest,
      }),
    ).toBe(h3EventRequest);
  });

  it("keeps the current context request when it already carries the session cookie", () => {
    const contextRequest = new Request("http://localhost:3004/_server-fn", {
      headers: {
        cookie: `${subscriberJourneySessionCookieName}=sess_admin_context`,
      },
    });
    const h3EventRequest = new Request("http://localhost:3004/", {
      headers: {
        cookie: `${subscriberJourneySessionCookieName}=sess_admin_h3`,
      },
    });

    expect(
      resolveSsrRequestContextRequest({
        contextRequest,
        h3EventRequest,
      }),
    ).toBe(contextRequest);
  });

  it("prefers the h3 event request when the current context request only carries unrelated cookies", () => {
    const contextRequest = new Request("http://localhost:3004/_server-fn", {
      headers: {
        cookie: "theme=dark; panel=open",
      },
    });
    const h3EventRequest = new Request("http://localhost:3004/", {
      headers: {
        cookie: `${subscriberJourneySessionCookieName}=sess_admin_h3`,
      },
    });

    expect(
      resolveSsrRequestContextRequest({
        contextRequest,
        h3EventRequest,
      }),
    ).toBe(h3EventRequest);
  });
});
