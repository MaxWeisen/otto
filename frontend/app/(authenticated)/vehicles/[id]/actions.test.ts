import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { NotFoundError, revalidatePath } from "@/test/next-mocks";
import { API_URL, server } from "@/test/server";
import {
  createMaintenanceRecordAction,
  deleteMaintenanceRecordAction,
  updateMaintenanceRecordAction,
} from "./actions";

const values = {
  type: "oil_change",
  performed_at: "2026-06-01",
  description: " Synthetic 5W-30 ",
  mileage: "84,500",
  cost: "49.99",
  notes: "",
};

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }

  return data;
}

describe("createMaintenanceRecordAction", () => {
  it("saves the normalized record and refreshes the vehicle pages", async () => {
    let body: unknown;

    server.use(
      http.post(
        `${API_URL}/api/vehicles/7/maintenance`,
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ id: 1 }, { status: 201 });
        },
      ),
    );

    const state = await createMaintenanceRecordAction(
      7,
      { values },
      formData(values),
    );

    expect(state).toEqual({ values, saved: true });
    expect(body).toEqual({
      type: "oil_change",
      performed_at: "2026-06-01",
      description: "Synthetic 5W-30",
      mileage: 84500,
      cost: "49.99",
      notes: null,
    });
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith(
      "/(authenticated)/vehicles",
      "layout",
    );
  });

  it("returns field errors without calling the API", async () => {
    const invalid = { ...values, description: "" };

    const state = await createMaintenanceRecordAction(
      7,
      { values },
      formData(invalid),
    );

    expect(state).toEqual({
      values: invalid,
      errors: { description: ["Description is required"] },
    });
  });

  it("shows an API validation message on its field", async () => {
    server.use(
      http.post(`${API_URL}/api/vehicles/7/maintenance`, () =>
        HttpResponse.json(
          { error: "performed_at must not be in the future" },
          { status: 400 },
        ),
      ),
    );

    const state = await createMaintenanceRecordAction(
      7,
      { values },
      formData(values),
    );

    expect(state).toEqual({
      values,
      errors: { performed_at: ["Date must not be in the future"] },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateMaintenanceRecordAction", () => {
  it("marks a record that is gone and refreshes the vehicle pages", async () => {
    server.use(
      http.get(`${API_URL}/api/vehicles/7`, () => HttpResponse.json({ id: 7 })),
      http.put(`${API_URL}/api/vehicles/7/maintenance/31`, () =>
        HttpResponse.json(
          { error: "Maintenance record not found." },
          { status: 404 },
        ),
      ),
    );

    const state = await updateMaintenanceRecordAction(
      7,
      31,
      { values },
      formData(values),
    );

    expect(state).toEqual({
      values,
      message: "This maintenance record no longer exists.",
      gone: true,
    });
    expect(revalidatePath).toHaveBeenCalledOnce();
  });

  it("shows the not-found page when the whole vehicle is gone", async () => {
    server.use(
      http.get(`${API_URL}/api/vehicles/7`, () =>
        HttpResponse.json({ error: "Vehicle not found." }, { status: 404 }),
      ),
      http.put(`${API_URL}/api/vehicles/7/maintenance/31`, () =>
        HttpResponse.json(
          { error: "Maintenance record not found." },
          { status: 404 },
        ),
      ),
    );

    await expect(
      updateMaintenanceRecordAction(7, 31, { values }, formData(values)),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("deleteMaintenanceRecordAction", () => {
  it("deletes the record and refreshes the vehicle pages", async () => {
    server.use(
      http.delete(
        `${API_URL}/api/vehicles/7/maintenance/31`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    await expect(deleteMaintenanceRecordAction(7, 31)).resolves.toEqual({
      ok: true,
    });
    expect(revalidatePath).toHaveBeenCalledOnce();
  });

  it("returns a failure without refreshing", async () => {
    server.use(
      http.delete(`${API_URL}/api/vehicles/7/maintenance/31`, () =>
        HttpResponse.json({ error: "Something went wrong." }, { status: 500 }),
      ),
    );

    await expect(deleteMaintenanceRecordAction(7, 31)).resolves.toEqual({
      ok: false,
      error: "Something went wrong.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
