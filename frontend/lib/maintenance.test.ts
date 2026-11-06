import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import {
  createMaintenanceRecord,
  deleteMaintenanceRecord,
  listMaintenanceRecords,
  updateMaintenanceRecord,
} from "@/lib/maintenance";
import type { MaintenanceInput } from "@/lib/maintenance-schema";
import { NotFoundError } from "@/test/next-mocks";
import { API_URL, server } from "@/test/server";

const input: MaintenanceInput = {
  type: "oil_change",
  performed_at: "2026-05-09",
  description: "Synthetic 5W-30",
  mileage: 180500,
  cost: "79.99",
  notes: null,
};

const saved = {
  ...input,
  id: 31,
  vehicle_id: 7,
  created_at: "2026-05-09T17:00:00Z",
};

describe("listMaintenanceRecords", () => {
  it("returns the vehicle's records", async () => {
    server.use(
      http.get(`${API_URL}/api/vehicles/7/maintenance`, () =>
        HttpResponse.json([saved]),
      ),
    );

    await expect(listMaintenanceRecords("7")).resolves.toEqual([saved]);
  });

  it("shows the not-found page for a vehicle the visitor cannot see", async () => {
    server.use(
      http.get(`${API_URL}/api/vehicles/8/maintenance`, () =>
        HttpResponse.json({ error: "Vehicle not found." }, { status: 404 }),
      ),
    );

    await expect(listMaintenanceRecords("8")).rejects.toThrow(NotFoundError);
  });

  it("shows the not-found page for an invalid id without calling the API", async () => {
    await expect(listMaintenanceRecords("abc")).rejects.toThrow(NotFoundError);
  });

  it("throws the API's message for other failures", async () => {
    server.use(
      http.get(`${API_URL}/api/vehicles/7/maintenance`, () =>
        HttpResponse.json({ error: "Something went wrong." }, { status: 500 }),
      ),
    );

    await expect(listMaintenanceRecords("7")).rejects.toThrow(
      "Something went wrong.",
    );
  });
});

describe("createMaintenanceRecord", () => {
  it("posts the record and returns the saved one", async () => {
    let body: unknown;

    server.use(
      http.post(
        `${API_URL}/api/vehicles/7/maintenance`,
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json(saved, { status: 201 });
        },
      ),
    );

    await expect(createMaintenanceRecord(7, input)).resolves.toEqual({
      ok: true,
      data: saved,
    });
    expect(body).toEqual(input);
  });

  it("shows the not-found page for another user's vehicle", async () => {
    server.use(
      http.post(`${API_URL}/api/vehicles/8/maintenance`, () =>
        HttpResponse.json({ error: "Vehicle not found." }, { status: 404 }),
      ),
    );

    await expect(createMaintenanceRecord(8, input)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("reports an unreachable backend", async () => {
    server.use(
      http.post(`${API_URL}/api/vehicles/7/maintenance`, () =>
        HttpResponse.error(),
      ),
    );

    await expect(createMaintenanceRecord(7, input)).resolves.toEqual({
      ok: false,
      status: 502,
      error: "Could not reach the server. Please try again.",
    });
  });
});

describe("updateMaintenanceRecord", () => {
  it("returns a missing record to the caller instead of not-found", async () => {
    server.use(
      http.put(`${API_URL}/api/vehicles/7/maintenance/31`, () =>
        HttpResponse.json(
          { error: "Maintenance record not found." },
          { status: 404 },
        ),
      ),
    );

    await expect(updateMaintenanceRecord(7, 31, input)).resolves.toEqual({
      ok: false,
      status: 404,
      error: "Maintenance record not found.",
    });
  });
});

describe("deleteMaintenanceRecord", () => {
  it("deletes the record", async () => {
    server.use(
      http.delete(
        `${API_URL}/api/vehicles/7/maintenance/31`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    await expect(deleteMaintenanceRecord(7, 31)).resolves.toEqual({
      ok: true,
    });
  });
});
