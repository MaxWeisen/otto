import "server-only";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { apiFetch, SESSION_TOKEN_KEY } from "@/lib/api";

export type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
};

/**
 * The signed-in visitor, or null when there is no valid session or the API
 * cannot be reached.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const sessionToken = (await cookies()).get(SESSION_TOKEN_KEY);

  if (!sessionToken) {
    return null;
  }

  let response: Response;

  try {
    response = await apiFetch("/auth/me", { onUnauthorized: "return" });
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const user = await response.json();

  return user as User;
});
