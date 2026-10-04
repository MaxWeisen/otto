import { vi } from "vitest";

// Stand-ins for the Next.js modules the app touches at its boundary. They
// are registered with vi.mock in test/setup.ts.

/** The error the mocked redirect() throws, like Next's own redirect. */
export class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}

export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

export const cookieJar = new Map<string, string>();

export const revalidatePath = vi.fn();

export const navigationModule = {
  redirect: (url: string): never => {
    throw new RedirectError(url);
  },
  useRouter: () => router,
  usePathname: () => "/vehicles",
  useSearchParams: () => new URLSearchParams(),
};

export const headersModule = {
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
};

export const cacheModule = {
  revalidatePath,
};
