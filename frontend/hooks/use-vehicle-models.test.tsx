import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { useVehicleModels } from "@/hooks/use-vehicle-models";
import { sendBrowserToLogin } from "@/lib/login";
import { server } from "@/test/server";

vi.mock("@/lib/login", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/login")>()),
  sendBrowserToLogin: vi.fn(),
}));

describe("useVehicleModels", () => {
  it("stays idle until both make and year are known", () => {
    const { result } = renderHook(() => useVehicleModels("Toyota", null));

    expect(result.current).toEqual({ status: "idle" });
  });

  it("loads the models for the make and year", async () => {
    server.use(
      http.get("*/api/vpic/models", () =>
        HttpResponse.json({ models: ["Camry", "Corolla"] }),
      ),
    );

    const { result } = renderHook(() => useVehicleModels("Toyota", 1999));

    expect(result.current).toEqual({ status: "loading" });
    await waitFor(() =>
      expect(result.current).toEqual({
        status: "ready",
        models: ["Camry", "Corolla"],
      }),
    );
  });

  it("sends a signed-out visitor to the login page", async () => {
    server.use(
      http.get("*/api/vpic/models", () =>
        HttpResponse.json({ error: "Unauthorized." }, { status: 401 }),
      ),
    );

    const { result } = renderHook(() => useVehicleModels("Honda", 1998));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(sendBrowserToLogin).toHaveBeenCalledTimes(1);
  });

  it("shows loading again when it returns to a make and year that failed", async () => {
    let failing = true;
    server.use(
      http.get("*/api/vpic/models", () =>
        failing
          ? HttpResponse.json({ error: "Upstream failed." }, { status: 502 })
          : HttpResponse.json({ models: ["Civic"] }),
      ),
    );

    const { result, rerender } = renderHook(
      ({ year }) => useVehicleModels("Honda", year),
      { initialProps: { year: 1997 as number | null } },
    );

    await waitFor(() => expect(result.current.status).toBe("error"));

    rerender({ year: null });
    expect(result.current).toEqual({ status: "idle" });

    failing = false;
    rerender({ year: 1997 });

    expect(result.current).toEqual({ status: "loading" });
    await waitFor(() =>
      expect(result.current).toEqual({ status: "ready", models: ["Civic"] }),
    );
  });
});
