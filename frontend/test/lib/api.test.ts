import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { apiFetch, proxyApiGet } from "@/lib/api";
import { cookieJar, RedirectError } from "@/test/next-mocks";
import { API_URL, server } from "@/test/server";

function serveStatus(status: number, body: string, contentType: string) {
  server.use(
    http.get(
      `${API_URL}/api/thing`,
      () =>
        new HttpResponse(body, {
          status,
          headers: { "Content-Type": contentType },
        }),
    ),
  );
}

describe("apiFetch", () => {
  it("forwards the session cookie and skips the cache", async () => {
    cookieJar.set("otto_session_token", "session-123");

    let cookie: string | null = null;

    server.use(
      http.get(`${API_URL}/api/thing`, ({ request }) => {
        cookie = request.headers.get("cookie");
        return HttpResponse.json({ ok: true });
      }),
    );

    const response = await apiFetch("/api/thing");

    expect(response.status).toBe(200);
    expect(cookie).toBe("otto_session_token=session-123");
  });

  it("sends the visitor to the login page on a 401 by default", async () => {
    serveStatus(401, `{"error":"Unauthorized."}`, "application/json");

    const result = apiFetch("/api/thing");

    await expect(result).rejects.toThrow(RedirectError);
    await result.catch((error: RedirectError) =>
      expect(error.url).toBe("/login?reason=unauthorized"),
    );
  });

  it("returns the 401 when asked to", async () => {
    serveStatus(401, `{"error":"Unauthorized."}`, "application/json");

    const response = await apiFetch("/api/thing", { onUnauthorized: "return" });

    expect(response.status).toBe(401);
  });

  it("returns other errors to the caller", async () => {
    serveStatus(500, `{"error":"boom"}`, "application/json");

    const response = await apiFetch("/api/thing");

    expect(response.status).toBe(500);
  });
});

describe("proxyApiGet", () => {
  it("relays the status, content type and body", async () => {
    serveStatus(404, "404 page not found\n", "text/plain; charset=utf-8");

    const response = await proxyApiGet("/api/thing");

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(await response.text()).toBe("404 page not found\n");
  });

  it("passes a 401 through for the browser to handle", async () => {
    serveStatus(401, `{"error":"Unauthorized."}`, "application/json");

    const response = await proxyApiGet("/api/thing");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
  });

  it("answers 502 when the backend cannot be reached", async () => {
    server.use(http.get(`${API_URL}/api/thing`, () => HttpResponse.error()));

    const response = await proxyApiGet("/api/thing");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Could not reach the server. Please try again.",
    });
  });
});
