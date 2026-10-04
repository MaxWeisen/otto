import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { cookieJar, RedirectError } from "@/test/next-mocks";
import { API_URL, server } from "@/test/server";
import LoginPage from "./page";

async function renderPage() {
  const page = await LoginPage({ searchParams: Promise.resolve({}) });

  return render(page);
}

describe("LoginPage", () => {
  it("sends a signed-in user to their vehicles", async () => {
    cookieJar.set("otto_session_token", "session-123");
    server.use(
      http.get(`${API_URL}/auth/me`, () =>
        HttpResponse.json({
          id: "user-1",
          name: "Ada Lovelace",
          email: "ada@example.com",
          avatarUrl: "https://example.com/ada.png",
        }),
      ),
    );

    await expect(renderPage()).rejects.toEqual(new RedirectError("/vehicles"));
  });

  it("shows the sign-in button when the API cannot be reached", async () => {
    cookieJar.set("otto_session_token", "session-123");
    server.use(http.get(`${API_URL}/auth/me`, () => HttpResponse.error()));

    await renderPage();

    expect(
      screen.getByRole("button", { name: "Sign in with Google" }),
    ).toBeInTheDocument();
  });
});
