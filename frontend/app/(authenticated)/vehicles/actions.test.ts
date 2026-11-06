import { http, HttpResponse } from "msw";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cookieJar,
  NotFoundError,
  RedirectError,
  revalidatePath,
} from "@/test/next-mocks";
import { API_URL, server } from "@/test/server";
import {
  createVehicleAction,
  deleteVehicleAction,
  updateVehicleAction,
  type VehicleFormState,
} from "./actions";

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
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith(
      "/(authenticated)/vehicles",
      "layout",
    );
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

  it("passes backend validation errors through as field errors", async () => {
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

    expect(state).toEqual({
      values: validFields,
      errors: { vin: ["VIN must be 17 characters"] },
    });
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

describe("updateVehicleAction", () => {
  const savedAccord = {
    id: 7,
    year: 2003,
    make: "Honda",
    model: "Accord",
    trim: null,
    vin: "1HGCM82633A004352",
    nickname: "Commuter",
    mileage: 182000,
  };

  function serveUpdate(status: number, body: object) {
    const requests: { id: string; body: unknown; cookie: string | null }[] = [];

    server.use(
      http.put(`${API_URL}/api/vehicles/:id`, async ({ params, request }) => {
        requests.push({
          id: String(params.id),
          body: await request.json(),
          cookie: request.headers.get("cookie"),
        });

        return HttpResponse.json(body, { status });
      }),
    );

    return requests;
  }

  it("replaces the vehicle with normalized data and refreshes its pages", async () => {
    cookieJar.set("otto_session_token", "session-123");
    const requests = serveUpdate(200, savedAccord);

    const state = await updateVehicleAction(
      7,
      initialState,
      formData(validFields),
    );

    expect(state).toEqual({ values: validFields, saved: true });
    expect(requests).toEqual([
      {
        id: "7",
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
      },
    ]);
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith(
      "/(authenticated)/vehicles",
      "layout",
    );
  });

  it("returns field errors without calling the API", async () => {
    const requests = serveUpdate(200, savedAccord);
    const fields = { ...validFields, make: "", mileage: "-5", vin: "ABC" };

    const state = await updateVehicleAction(7, initialState, formData(fields));

    expect(state).toEqual({
      values: fields,
      errors: {
        make: ["Make is required"],
        mileage: ["Mileage must be a whole number of 0 or more"],
        vin: ["VIN must be 17 characters (currently 3)"],
      },
    });
    expect(requests).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("maps a backend validation error to its field", async () => {
    serveUpdate(400, { error: "year must be between 1886 and 2027" });

    const state = await updateVehicleAction(
      7,
      initialState,
      formData(validFields),
    );

    expect(state).toEqual({
      values: validFields,
      errors: { year: ["Year must be between 1886 and 2027"] },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("shows other backend errors as a message for the form", async () => {
    serveUpdate(500, { error: "Something went wrong. Please try again." });

    const state = await updateVehicleAction(
      7,
      initialState,
      formData(validFields),
    );

    expect(state).toEqual({
      values: validFields,
      message: "Something went wrong. Please try again.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("shows the not-found page for a vehicle the visitor does not own", async () => {
    serveUpdate(404, { error: "Vehicle not found." });

    await expect(
      updateVehicleAction(8, initialState, formData(validFields)),
    ).rejects.toThrow(NotFoundError);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, "7" as unknown as number])(
    "shows the not-found page for the crafted id %j without asking the backend",
    async (id) => {
      const requests = serveUpdate(200, savedAccord);

      await expect(
        updateVehicleAction(id, initialState, formData(validFields)),
      ).rejects.toThrow(NotFoundError);
      expect(requests).toEqual([]);
    },
  );

  it("explains when the backend cannot be reached", async () => {
    server.use(
      http.put(`${API_URL}/api/vehicles/:id`, () => HttpResponse.error()),
    );

    const state = await updateVehicleAction(
      7,
      initialState,
      formData(validFields),
    );

    expect(state).toEqual({
      values: validFields,
      message: "Could not reach the server. Please try again.",
    });
  });

  it("sends signed-out visitors to the login page", async () => {
    serveUpdate(401, { error: "Unauthorized." });

    await expectRedirect(
      updateVehicleAction(7, initialState, formData(validFields)),
      "/login?reason=unauthorized",
    );
  });
});

describe("deleteVehicleAction", () => {
  function serveDelete(response: () => Response) {
    const requests: { id: string; cookie: string | null }[] = [];

    server.use(
      http.delete(`${API_URL}/api/vehicles/:id`, ({ params, request }) => {
        requests.push({
          id: String(params.id),
          cookie: request.headers.get("cookie"),
        });

        return response();
      }),
    );

    return requests;
  }

  it("deletes the vehicle and returns to the list with a success toast", async () => {
    cookieJar.set("otto_session_token", "session-123");
    const requests = serveDelete(() => new HttpResponse(null, { status: 204 }));

    await expectRedirect(deleteVehicleAction(7), "/vehicles?status=deleted");
    expect(requests).toEqual([
      { id: "7", cookie: "otto_session_token=session-123" },
    ]);
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith(
      "/(authenticated)/vehicles",
      "layout",
    );
  });

  it("shows the not-found page for a vehicle the visitor does not own", async () => {
    serveDelete(() =>
      HttpResponse.json({ error: "Vehicle not found." }, { status: 404 }),
    );

    await expect(deleteVehicleAction(8)).rejects.toThrow(NotFoundError);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN, "7" as unknown as number])(
    "shows the not-found page for the crafted id %j without asking the backend",
    async (id) => {
      const requests = serveDelete(
        () => new HttpResponse(null, { status: 204 }),
      );

      await expect(deleteVehicleAction(id)).rejects.toThrow(NotFoundError);
      expect(requests).toEqual([]);
    },
  );

  it("returns other backend errors as a message", async () => {
    serveDelete(() =>
      HttpResponse.json({ error: "unable to delete vehicle" }, { status: 500 }),
    );

    expect(await deleteVehicleAction(7)).toEqual({
      message: "Unable to delete vehicle",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("explains when the backend cannot be reached", async () => {
    serveDelete(() => HttpResponse.error());

    expect(await deleteVehicleAction(7)).toEqual({
      message: "Could not reach the server. Please try again.",
    });
  });

  it("sends signed-out visitors to the login page", async () => {
    serveDelete(() =>
      HttpResponse.json({ error: "Unauthorized." }, { status: 401 }),
    );

    await expectRedirect(deleteVehicleAction(7), "/login?reason=unauthorized");
  });
});
