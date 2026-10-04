import "server-only";
import { cookies } from "next/headers";
import { capitalize } from "@/lib/utils";

export const SESSION_TOKEN_KEY = "otto_session_token";

/**
 * Calls the otto API, forwarding the visitor's session cookie so the backend
 * can authenticate the request.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const sessionToken = (await cookies()).get(SESSION_TOKEN_KEY);
  const headers = new Headers(init.headers);

  if (sessionToken) {
    headers.set("Cookie", `${SESSION_TOKEN_KEY}=${sessionToken.value}`);
  }

  return fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

/** Reads the message from an API error response of the form {"error": "..."}. */
export async function readApiError(response: Response): Promise<string> {
  try {
    const body = await response.json();

    if (typeof body?.error === "string" && body.error) {
      return capitalize(body.error);
    }
  } catch {
    // fall through to the generic message
  }

  return "Something went wrong. Please try again.";
}

/**
 * Forwards a GET request to the otto API with the visitor's session cookie and
 * relays the response status, content type and body unchanged.
 */
export async function proxyApiGet(path: string): Promise<Response> {
  try {
    const response = await apiFetch(path);

    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch {
    return Response.json(
      { error: "Could not reach the server. Please try again." },
      { status: 502 },
    );
  }
}
