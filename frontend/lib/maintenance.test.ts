import { http, HttpResponse, type JsonBodyType } from "msw";
import { describe, expect, it } from "vitest";
import {
  createMaintenanceRecord,
  deleteMaintenanceRecord,
  listMaintenanceRecords,
  updateMaintenanceRecord,
} from "@/lib/maintenance";
import type { MaintenanceInput } from "@/lib/maintenance-schema";
import { cookieJar, NotFoundError, RedirectError } from "@/test/next-mocks";
import { API_URL, server } from "@/test/server";

const oilChange = {
  id: 31,
  vehicle_id: 7,
  type: "oil_change",
  description: "Synthetic 5W-30 and filter",
  performed_at: "2026-05-09",
  mileage: 180500,
  cost: "79.99",
  notes: null,
  created_at: "2026-05-09T17:00:00Z",
};

const input: MaintenanceInput = {
  type: "oil_change",
  performed_at: "2026-05-09",
  description: "Synthetic 5W-30 and filter",
  mileage: 180500,
  cost: "79.99",
  notes: null,
};

type Request = { method: string; path: string; body?: unknown };

function serve(
  method: "get" | "post" | "put" | "delete",
  status: number,
  body?: JsonBodyType,
) {
  const requests: Request[] = [];

  server.use(
    http[method](`${API_URL}/api/vehicles/*`, async ({ request }) => {
      const text = await request.text();

      requests.push({
        method: request.method,
        path: new URL(request.url).pathname,
        body: text ? JSON.parse(text) : undefined,
      });

      return status === 204
        ? new HttpResponse(null, { status })
        : HttpResponse.json(body, { status });
    }),
  );

  return requests;
}

describe("listMaintenanceRecords", () => {
  it("returns the vehicle's records with the session cookie", async () => {
    cookieJar.set("otto_session_token", "session-123");

    let cookie: string | null = null;

    server.use(
      http.get(`${API_URL}/api/vehicles/7/maintenance`, ({ request }) => {
        cookie = request.headers.get("cookie");
        return HttpResponse.json([oilChange]);
      }),
    );

    await expect(listMaintenanceRecords("7")).resolves.toEqual([oilChange]);
    expect(cookie).toBe("otto_session_token=session-123");
  });

  it("shows the not-found page for a vehicle the visitor cannot see", async () => {
    serve("get", 404, { error: "Vehicle not found." });

    await expect(listMaintenanceRecords("8")).rejects.toThrow(NotFoundError);
  });

  it.each(["abc", "0", "07", "1e3", "9007199254740993"])(
    "shows the not-found page for the invalid id %j without asking the backend",
    async (id) => {
      const requests = serve("get", 200, []);

      await expect(listMaintenanceRecords(id)).rejects.toThrow(NotFoundError);
      expect(requests).toEqual([]);
    },
  );

  it("sends signed-out visitors to the login page", async () => {
    serve("get", 401, { error: "Unauthorized." });

    await expect(listMaintenanceRecords("7")).rejects.toThrow(RedirectError);
  });

  it("throws the API's message for other failures", async () => {
    serve("get", 500, { error: "Something went wrong. Please try again." });

    await expect(listMaintenanceRecords("7")).rejects.toThrow(
      "Something went wrong. Please try again.",
    );
  });
});

describe("createMaintenanceRecord", () => {
  it("posts the record and returns the saved one", async () => {
    const requests = serve("post", 201, oilChange);

    await expect(createMaintenanceRecord(7, input)).resolves.toEqual({
      ok: true,
      data: oilChange,
    });
    expect(requests).toEqual([
      { method: "POST", path: "/api/vehicles/7/maintenance", body: input },
    ]);
  });

  it("returns the API's validation message", async () => {
    serve("post", 400, { error: "cost must not be negative" });

    await expect(createMaintenanceRecord(7, input)).resolves.toEqual({
      ok: false,
      status: 400,
      error: "Cost must not be negative",
    });
  });

  it("shows the not-found page for another user's vehicle", async () => {
    serve("post", 404, { error: "Vehicle not found." });

    await expect(createMaintenanceRecord(8, input)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("refuses an id that is not a vehicle id without asking the backend", async () => {
    const requests = serve("post", 201, oilChange);

    await expect(createMaintenanceRecord(-1, input)).rejects.toThrow(
      NotFoundError,
    );
    expect(requests).toEqual([]);
  });

  it("reports an unreachable backend", async () => {
    server.use(
      http.post(`${API_URL}/api/vehicles/*`, () => HttpResponse.error()),
    );

    await expect(createMaintenanceRecord(7, input)).resolves.toEqual({
      ok: false,
      status: 502,
      error: "Could not reach the server. Please try again.",
    });
  });
});

describe("updateMaintenanceRecord", () => {
  it("replaces the record", async () => {
    const requests = serve("put", 200, oilChange);

    await expect(updateMaintenanceRecord(7, 31, input)).resolves.toEqual({
      ok: true,
      data: oilChange,
    });
    expect(requests).toEqual([
      { method: "PUT", path: "/api/vehicles/7/maintenance/31", body: input },
    ]);
  });

  it("returns a 404 to the caller", async () => {
    serve("put", 404, { error: "Maintenance record not found." });

    await expect(updateMaintenanceRecord(7, 31, input)).resolves.toEqual({
      ok: false,
      status: 404,
      error: "Maintenance record not found.",
    });
  });

  it("refuses a record id that is not an id", async () => {
    const requests = serve("put", 200, oilChange);

    await expect(updateMaintenanceRecord(7, 1.5, input)).rejects.toThrow(
      NotFoundError,
    );
    expect(requests).toEqual([]);
  });
});

describe("deleteMaintenanceRecord", () => {
  it("deletes the record", async () => {
    const requests = serve("delete", 204);

    await expect(deleteMaintenanceRecord(7, 31)).resolves.toEqual({
      ok: true,
    });
    expect(requests).toEqual([
      { method: "DELETE", path: "/api/vehicles/7/maintenance/31" },
    ]);
  });

  it("returns failures to the caller", async () => {
    serve("delete", 404, { error: "Maintenance record not found." });

    await expect(deleteMaintenanceRecord(7, 31)).resolves.toEqual({
      ok: false,
      status: 404,
      error: "Maintenance record not found.",
    });
  });
});
