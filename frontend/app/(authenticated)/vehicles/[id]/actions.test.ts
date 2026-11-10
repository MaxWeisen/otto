import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { NotFoundError, revalidatePath } from "@/test/next-mocks";
import { API_URL, server } from "@/test/server";
import {
  createMaintenanceRecordAction,
  deleteMaintenanceRecordAction,
  updateMaintenanceRecordAction,
} from "./actions";

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }

  return data;
}

const fields = {
  type: "oil_change",
  performed_at: "2026-06-01",
  description: " Synthetic 5W-30 ",
  mileage: "84,500",
  cost: "",
  notes: "",
};

describe("createMaintenanceRecordAction", () => {
  it("sends the typed values and refreshes the vehicle pages", async () => {
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

    const state = await createMaintenanceRecordAction(7, {}, formData(fields));

    expect(state).toEqual({ saved: true });
    expect(body).toEqual({
      type: "oil_change",
      performed_at: "2026-06-01",
      description: "Synthetic 5W-30",
      mileage: "84,500",
      cost: null,
      notes: null,
    });
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith(
      "/(authenticated)/vehicles",
      "layout",
    );
  });

  it("returns the server's field errors with the submitted values", async () => {
    server.use(
      http.post(`${API_URL}/api/vehicles/7/maintenance`, () =>
        HttpResponse.json(
          {
            error: "Check the highlighted fields.",
            errors: { description: "Description is required" },
          },
          { status: 400 },
        ),
      ),
    );

    const state = await createMaintenanceRecordAction(7, {}, formData(fields));

    expect(state).toEqual({
      values: fields,
      errors: { description: "Description is required" },
    });
  });
});

describe("updateMaintenanceRecordAction", () => {
  it("explains a record that is gone", async () => {
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
      {},
      formData(fields),
    );

    expect(state.message).toBe("This maintenance record no longer exists.");
  });

  it("shows the not-found page when the vehicle is gone", async () => {
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
      updateMaintenanceRecordAction(7, 31, {}, formData(fields)),
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
});
