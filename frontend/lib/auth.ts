import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";

type User = { id: string; name: string; email: string; avatarUrl: string };

const SESSION_TOKEN_KEY = "otto_session_token";

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const sessionToken = (await cookies()).get(SESSION_TOKEN_KEY);

  if (!sessionToken) {
    return null;
  }

  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
    headers: { Cookie: `${SESSION_TOKEN_KEY}=${sessionToken.value}` },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const user = await response.json();

  return user as User;
});
