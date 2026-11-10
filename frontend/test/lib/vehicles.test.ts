import { http, HttpResponse, type JsonBodyType } from "msw";
import { describe, expect, it } from "vitest";
import { getVehicle } from "@/lib/vehicles";
import { NotFoundError, RedirectError } from "@/test/next-mocks";
import { API_URL, server } from "@/test/server";

const accord = {
  id: 7,
  year: 2003,
  make: "Honda",
  model: "Accord",
  trim: "EX-V6",
  vin: "1HGCM82633A004352",
  nickname: "Commuter",
  mileage: 182000,
};

function serveVehicle(status: number, body: JsonBodyType) {
  const requestedIds: string[] = [];

  server.use(
    http.get(`${API_URL}/api/vehicles/:id`, ({ params }) => {
      requestedIds.push(String(params.id));
      return HttpResponse.json(body, { status });
    }),
  );

  return requestedIds;
}

describe("getVehicle", () => {
  it("returns the visitor's vehicle", async () => {
    const requestedIds = serveVehicle(200, accord);

    await expect(getVehicle("7")).resolves.toEqual(accord);
    expect(requestedIds).toEqual(["7"]);
  });

  it("shows the not-found page when the backend answers 404", async () => {
    serveVehicle(404, { error: "vehicle not found" });

    await expect(getVehicle("8")).rejects.toThrow(NotFoundError);
  });

  it.each(["abc", "0", "-1", "1.5", "07", "1e3", " 7", "9007199254740993"])(
    "shows the not-found page for the invalid id %j without asking the backend",
    async (id) => {
      const requestedIds = serveVehicle(200, accord);

      await expect(getVehicle(id)).rejects.toThrow(NotFoundError);
      expect(requestedIds).toEqual([]);
    },
  );

  it("sends signed-out visitors to the login page", async () => {
    serveVehicle(401, { error: "Unauthorized." });

    await expect(getVehicle("7")).rejects.toThrow(RedirectError);
  });

  it("throws other errors for the error boundary", async () => {
    serveVehicle(500, { error: "unable to get vehicle" });

    await expect(getVehicle("7")).rejects.toThrow("Unable to get vehicle");
  });
});
