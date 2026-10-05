import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { cookieJar } from "./next-mocks";
import { server } from "./server";

vi.mock(
  "next/navigation",
  async () => (await import("./next-mocks")).navigationModule,
);
vi.mock(
  "next/headers",
  async () => (await import("./next-mocks")).headersModule,
);
vi.mock("next/cache", async () => (await import("./next-mocks")).cacheModule);

// jsdom lacks the layout APIs the Base UI popups rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });

  // The browser resolves relative URLs such as /api/vpic/models against the
  // page; Node's fetch does not, so resolve them against jsdom's location.
  const fetchWithMsw = globalThis.fetch;

  globalThis.fetch = (input, init) =>
    fetchWithMsw(
      typeof input === "string" && input.startsWith("/")
        ? new URL(input, window.location.origin)
        : input,
      init,
    );
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  cookieJar.clear();
  vi.clearAllMocks();
});

afterAll(() => {
  server.close();
});
