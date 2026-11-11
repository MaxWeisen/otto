import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import {
  listMaintenanceRecords,
  saveMaintenanceRecord,
  type MaintenanceInput,
} from "@/lib/maintenance";
import { NotFoundError } from "@/test/next-mocks";
import { API_URL, server } from "@/test/server";

const input: MaintenanceInput = {
  type: "oil_change",
  performed_at: "2026-05-09",
  description: "Synthetic 5W-30",
  mileage: "180,500",
  cost: "79.99",
  notes: null,
};

describe("listMaintenanceRecords", () => {
  it("returns the vehicle's records", async () => {
    server.use(
      http.get(`${API_URL}/api/vehicles/7/maintenance`, () =>
        HttpResponse.json([{ id: 31 }]),
      ),
    );

    await expect(listMaintenanceRecords("7")).resolves.toEqual([{ id: 31 }]);
  });

  it("shows the not-found page for a vehicle the visitor cannot see", async () => {
    server.use(
      http.get(`${API_URL}/api/vehicles/8/maintenance`, () =>
        HttpResponse.json({ error: "Vehicle not found." }, { status: 404 }),
      ),
    );

    await expect(listMaintenanceRecords("8")).rejects.toThrow(NotFoundError);
  });
});

describe("saveMaintenanceRecord", () => {
  it("posts a new record", async () => {
    let body: unknown;
    server.use(
      http.post(
        `${API_URL}/api/vehicles/7/maintenance`,
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ id: 31 }, { status: 201 });
        },
      ),
    );

    await expect(saveMaintenanceRecord(7, undefined, input)).resolves.toEqual({
      ok: true,
    });
    expect(body).toEqual(input);
  });

  it("returns the server's field errors", async () => {
    server.use(
      http.put(`${API_URL}/api/vehicles/7/maintenance/31`, () =>
        HttpResponse.json(
          {
            error: "Check the highlighted fields.",
            errors: { cost: "Cost must not be negative" },
          },
          { status: 400 },
        ),
      ),
    );

    await expect(saveMaintenanceRecord(7, 31, input)).resolves.toEqual({
      ok: false,
      status: 400,
      error: "Check the highlighted fields.",
      errors: { cost: "Cost must not be negative" },
    });
  });

  it("reports an unreachable backend", async () => {
    server.use(
      http.post(`${API_URL}/api/vehicles/7/maintenance`, () =>
        HttpResponse.error(),
      ),
    );

    await expect(saveMaintenanceRecord(7, undefined, input)).resolves.toEqual({
      ok: false,
      status: 502,
      error: "Could not reach the server. Please try again.",
    });
  });
});
