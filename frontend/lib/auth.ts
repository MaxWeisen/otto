import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { apiFetch, SESSION_TOKEN_KEY } from "@/lib/api";

export type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
};

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const sessionToken = (await cookies()).get(SESSION_TOKEN_KEY);

  if (!sessionToken) {
    return null;
  }

  const response = await apiFetch("/auth/me");

  if (!response.ok) {
    return null;
  }

  const user = await response.json();

  return user as User;
});

export function redirectToLogin(): never {
  redirect("/login?reason=unauthorized");
}
