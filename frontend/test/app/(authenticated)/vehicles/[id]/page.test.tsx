import { render, screen } from "@testing-library/react";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { describe, expect, it } from "vitest";
import { NotFoundError } from "@/test/next-mocks";
import { API_URL, server } from "@/test/server";
import VehicleNotFound from "@/app/(authenticated)/vehicles/[id]/not-found";
import VehiclePage, {
  generateMetadata,
} from "@/app/(authenticated)/vehicles/[id]/page";

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

function serveVehicle(
  status: number,
  body: JsonBodyType,
  records: JsonBodyType = [],
) {
  server.use(
    http.get(`${API_URL}/api/vehicles/:id`, () =>
      HttpResponse.json(body, { status }),
    ),
    http.get(`${API_URL}/api/vehicles/:id/maintenance`, () =>
      status === 200
        ? HttpResponse.json(records)
        : HttpResponse.json(body, { status }),
    ),
  );
}

/** The value listed next to a label in the vehicle's details. */
function detail(label: string) {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling;
}

async function renderPage(id: string) {
  return render(await VehiclePage({ params: Promise.resolve({ id }) }));
}

describe("VehiclePage", () => {
  it("shows the vehicle's details", async () => {
    serveVehicle(200, accord);

    await renderPage("7");

    expect(
      screen.getByRole("heading", { name: "2003 Honda Accord" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Commuter")).toBeInTheDocument();
    expect(detail("Make")).toHaveTextContent("Honda");
    expect(detail("Model")).toHaveTextContent("Accord");
    expect(detail("Trim")).toHaveTextContent("EX-V6");
    expect(detail("Mileage")).toHaveTextContent("182,000 mi");
    expect(detail("VIN")).toHaveTextContent("1HGCM82633A004352");
  });

  it("wraps long details instead of truncating them", async () => {
    serveVehicle(200, accord);

    await renderPage("7");

    for (const label of ["Make", "Model", "Trim", "Mileage"]) {
      expect(detail(label)).toHaveClass("break-words");
      expect(detail(label)).not.toHaveClass("truncate");
    }

    expect(detail("VIN")).toHaveClass("break-all");
  });

  it("lists the vehicle's maintenance below its details", async () => {
    serveVehicle(200, accord, [oilChange]);

    await renderPage("7");

    expect(
      screen.getByRole("heading", { name: "Maintenance" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Synthetic 5W-30 and filter")).toBeInTheDocument();
    expect(screen.getByText("$79.99")).toBeInTheDocument();
  });

  it("shows the empty maintenance state for a vehicle without records", async () => {
    serveVehicle(200, accord);

    await renderPage("7");

    expect(screen.getByText("No maintenance logged yet")).toBeInTheDocument();
  });

  it("links back to the vehicle list", async () => {
    serveVehicle(200, accord);

    await renderPage("7");

    expect(
      screen.getByRole("link", { name: "Back to vehicles" }),
    ).toHaveAttribute("href", "/vehicles");
  });

  it("shows a dash for details the vehicle does not have", async () => {
    serveVehicle(200, {
      ...accord,
      trim: null,
      vin: null,
      nickname: null,
      mileage: null,
    });

    await renderPage("7");

    expect(screen.queryByText("Commuter")).not.toBeInTheDocument();
    expect(screen.getAllByText("-")).toHaveLength(3);
  });

  it("names the browser tab after the vehicle", async () => {
    serveVehicle(200, accord);

    const metadata = await generateMetadata({
      params: Promise.resolve({ id: "7" }),
    });

    expect(metadata.title).toBe("2003 Honda Accord - Otto");
  });

  it("shows the not-found page for a vehicle the visitor cannot see", async () => {
    serveVehicle(404, { error: "vehicle not found" });

    await expect(renderPage("8")).rejects.toThrow(NotFoundError);
  });
});

describe("VehicleNotFound", () => {
  it("links back to the vehicle list", () => {
    render(<VehicleNotFound />);

    expect(screen.getByText("Vehicle not found")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to vehicles" }),
    ).toHaveAttribute("href", "/vehicles");
  });
});
