import { http, HttpResponse } from "msw";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cookieJar, RedirectError, revalidatePath } from "@/test/next-mocks";
import { API_URL, server } from "@/test/server";
import { createVehicleAction, type VehicleFormState } from "./actions";

// Pin the clock so the latest accepted model year (next year) is stable.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
});

afterAll(() => {
  vi.useRealTimers();
});

const initialState: VehicleFormState = {
  values: {
    year: "",
    make: "",
    model: "",
    trim: "",
    nickname: "",
    mileage: "",
    vin: "",
  },
};

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }

  return data;
}

const validFields = {
  year: "2003",
  make: " Honda ",
  model: "Accord",
  trim: "  ",
  nickname: " Commuter ",
  mileage: "182,000",
  vin: "1hgcm82633a004352",
};

async function expectRedirect(promise: Promise<unknown>, url: string) {
  await expect(promise).rejects.toThrow(RedirectError);
  await promise.catch((error: RedirectError) => expect(error.url).toBe(url));
}

describe("createVehicleAction", () => {
  it("creates the vehicle with normalized data and the session cookie", async () => {
    cookieJar.set("otto_session_token", "session-123");

    let request: { body: unknown; cookie: string | null } | undefined;

    server.use(
      http.post(`${API_URL}/api/vehicles`, async ({ request: req }) => {
        request = {
          body: await req.json(),
          cookie: req.headers.get("cookie"),
        };

        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );

    await expectRedirect(
      createVehicleAction(initialState, formData(validFields)),
      "/vehicles?status=created",
    );

    expect(request).toEqual({
      cookie: "otto_session_token=session-123",
      body: {
        year: 2003,
        make: "Honda",
        model: "Accord",
        trim: null,
        nickname: "Commuter",
        mileage: 182000,
        vin: "1HGCM82633A004352",
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/vehicles");
  });

  it("returns field errors without calling the API", async () => {
    const fields = { ...validFields, year: "1700", model: " " };

    const state = await createVehicleAction(initialState, formData(fields));

    expect(state).toEqual({
      values: { ...fields },
      errors: {
        year: ["Year must be between 1886 and 2027"],
        model: ["Model is required"],
      },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("passes backend validation errors through", async () => {
    server.use(
      http.post(`${API_URL}/api/vehicles`, () =>
        HttpResponse.json(
          { error: "vin must be 17 characters" },
          { status: 400 },
        ),
      ),
    );

    const state = await createVehicleAction(
      initialState,
      formData(validFields),
    );

    expect(state.message).toBe("Vin must be 17 characters");
    expect(state.values).toEqual(validFields);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("shows a generic message when the backend error has no body", async () => {
    server.use(
      http.post(
        `${API_URL}/api/vehicles`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const state = await createVehicleAction(
      initialState,
      formData(validFields),
    );

    expect(state.message).toBe("Something went wrong. Please try again.");
  });

  it("explains when the backend cannot be reached", async () => {
    server.use(
      http.post(`${API_URL}/api/vehicles`, () => HttpResponse.error()),
    );

    const state = await createVehicleAction(
      initialState,
      formData(validFields),
    );

    expect(state).toEqual({
      values: validFields,
      message: "Could not reach the server. Please try again.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sends signed-out visitors to the login page", async () => {
    server.use(
      http.post(`${API_URL}/api/vehicles`, () =>
        HttpResponse.json({ error: "Unauthorized." }, { status: 401 }),
      ),
    );

    await expectRedirect(
      createVehicleAction(initialState, formData(validFields)),
      "/login?reason=unauthorized",
    );
  });
});
