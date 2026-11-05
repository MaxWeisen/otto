import { http, HttpResponse, type JsonBodyType } from "msw";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NotFoundError, revalidatePath } from "@/test/next-mocks";
import { API_URL, server } from "@/test/server";
import {
  createMaintenanceRecordAction,
  deleteMaintenanceRecordAction,
  updateMaintenanceRecordAction,
  type MaintenanceFormState,
} from "./actions";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 5, 15, 12));
});

afterAll(() => {
  vi.useRealTimers();
});

const fields = {
  type: "oil_change",
  performed_at: "2026-06-01",
  description: " Synthetic 5W-30 ",
  mileage: "84,500",
  cost: "49.99",
  notes: "",
};

const initialState: MaintenanceFormState = {
  values: { ...fields, description: "" },
};

function formData(values: Record<string, string>): FormData {
  const data = new FormData();

  for (const [name, value] of Object.entries(values)) {
    data.set(name, value);
  }

  return data;
}

function serve(
  method: "post" | "put" | "delete",
  status: number,
  body?: JsonBodyType,
) {
  const bodies: unknown[] = [];

  server.use(
    http[method](`${API_URL}/api/vehicles/*`, async ({ request }) => {
      const text = await request.text();

      bodies.push(text ? JSON.parse(text) : undefined);

      return status === 204
        ? new HttpResponse(null, { status })
        : HttpResponse.json(body, { status });
    }),
  );

  return bodies;
}

describe("createMaintenanceRecordAction", () => {
  it("creates the normalized record and refreshes the vehicle page", async () => {
    const bodies = serve("post", 201, { id: 1 });

    await expect(
      createMaintenanceRecordAction(7, initialState, formData(fields)),
    ).resolves.toEqual({ values: fields, saved: true });
    expect(bodies).toEqual([
      {
        type: "oil_change",
        performed_at: "2026-06-01",
        description: "Synthetic 5W-30",
        mileage: 84500,
        cost: "49.99",
        notes: null,
      },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/vehicles/7");
    expect(revalidatePath).toHaveBeenCalledWith("/vehicles");
  });

  it("returns field errors without calling the API", async () => {
    const bodies = serve("post", 201, { id: 1 });
    const values = { ...fields, description: "", cost: "-1" };

    await expect(
      createMaintenanceRecordAction(7, initialState, formData(values)),
    ).resolves.toEqual({
      values,
      errors: {
        description: ["Description is required"],
        cost: ["Cost must not be negative"],
      },
    });
    expect(bodies).toEqual([]);
  });

  it("maps an API validation message to its field", async () => {
    serve("post", 400, { error: "performed_at must not be in the future" });

    await expect(
      createMaintenanceRecordAction(7, initialState, formData(fields)),
    ).resolves.toEqual({
      values: fields,
      errors: { performed_at: ["Date must not be in the future"] },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns other API failures as a message", async () => {
    serve("post", 500, { error: "Something went wrong. Please try again." });

    await expect(
      createMaintenanceRecordAction(7, initialState, formData(fields)),
    ).resolves.toEqual({
      values: fields,
      message: "Something went wrong. Please try again.",
    });
  });

  it("shows the not-found page for another user's vehicle", async () => {
    serve("post", 404, { error: "Vehicle not found." });

    await expect(
      createMaintenanceRecordAction(8, initialState, formData(fields)),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("updateMaintenanceRecordAction", () => {
  it("saves the record and refreshes the vehicle page", async () => {
    const bodies = serve("put", 200, { id: 31 });

    await expect(
      updateMaintenanceRecordAction(7, 31, initialState, formData(fields)),
    ).resolves.toEqual({ values: fields, saved: true });
    expect(bodies).toHaveLength(1);
    expect(revalidatePath).toHaveBeenCalledWith("/vehicles/7");
    expect(revalidatePath).toHaveBeenCalledWith("/vehicles");
  });

  it("explains a record that is gone and refreshes the page", async () => {
    serve("put", 404, { error: "Maintenance record not found." });

    await expect(
      updateMaintenanceRecordAction(7, 31, initialState, formData(fields)),
    ).resolves.toEqual({
      values: fields,
      message: "This maintenance record no longer exists.",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/vehicles/7");
  });
});

describe("deleteMaintenanceRecordAction", () => {
  it("deletes the record and refreshes the vehicle page", async () => {
    serve("delete", 204);

    await expect(deleteMaintenanceRecordAction(7, 31)).resolves.toEqual({
      ok: true,
    });
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/vehicles/7");
  });

  it("explains a record that is gone and refreshes the page", async () => {
    serve("delete", 404, { error: "Maintenance record not found." });

    await expect(deleteMaintenanceRecordAction(7, 31)).resolves.toEqual({
      ok: false,
      error: "This maintenance record no longer exists.",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/vehicles/7");
  });

  it("returns other failures without refreshing", async () => {
    serve("delete", 500, { error: "Something went wrong. Please try again." });

    await expect(deleteMaintenanceRecordAction(7, 31)).resolves.toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
