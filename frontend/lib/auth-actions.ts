"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_TOKEN_KEY } from "@/lib/auth";

export async function logout() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_TOKEN_KEY);

  if (sessionToken) {
    // the local cookie is cleared even if the backend cannot end the session
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/logout`,
        {
          method: "POST",
          headers: { Cookie: `${SESSION_TOKEN_KEY}=${sessionToken.value}` },
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        },
      );

      if (!response.ok) {
        console.error("logout request failed", response.status);
      }
    } catch (error) {
      console.error("logout request failed", error);
    }
  }

  const domain = process.env.COOKIE_DOMAIN;
  if (domain) {
    cookieStore.delete({ name: SESSION_TOKEN_KEY, path: "/", domain });
  } else {
    cookieStore.delete(SESSION_TOKEN_KEY);
  }
  redirect("/");
}
