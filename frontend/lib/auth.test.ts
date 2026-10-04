import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { getCurrentUser } from "@/lib/auth";
import { cookieJar } from "@/test/next-mocks";
import { API_URL, server } from "@/test/server";

const user = {
  id: "user-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  avatarUrl: "https://example.com/ada.png",
};

describe("getCurrentUser", () => {
  it("returns null without a session cookie", async () => {
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("returns the signed-in user", async () => {
    cookieJar.set("otto_session_token", "session-123");
    server.use(http.get(`${API_URL}/auth/me`, () => HttpResponse.json(user)));

    await expect(getCurrentUser()).resolves.toEqual(user);
  });

  it("returns null for an expired session", async () => {
    cookieJar.set("otto_session_token", "session-123");
    server.use(
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json({ error: "Unauthorized." }, { status: 401 }),
      ),
    );

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("throws when the API cannot be reached", async () => {
    cookieJar.set("otto_session_token", "session-123");
    server.use(http.get(`${API_URL}/auth/me`, () => HttpResponse.error()));

    await expect(getCurrentUser()).rejects.toThrow();
  });
});
