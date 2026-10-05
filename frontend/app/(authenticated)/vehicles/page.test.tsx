import { render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { RedirectError, router } from "@/test/next-mocks";
import { API_URL, server } from "@/test/server";
import VehiclesPage from "./page";

async function renderPage(status?: string) {
  const page = await VehiclesPage({
    searchParams: Promise.resolve({ status }),
  });

  return render(
    <>
      <Toaster />
      {page}
    </>,
  );
}

function serveVehicles(vehicles: unknown[]) {
  server.use(
    http.get(`${API_URL}/api/vehicles`, () => HttpResponse.json(vehicles)),
  );
}

describe("VehiclesPage", () => {
  it("shows an empty state that links to the add form", async () => {
    serveVehicles([]);

    await renderPage();

    expect(screen.getByText("No vehicles yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add vehicle" })).toHaveAttribute(
      "href",
      "/vehicles/new",
    );
  });

  it("lists each vehicle with its details", async () => {
    serveVehicles([
      {
        id: 2,
        year: 2003,
        make: "Honda",
        model: "Accord",
        trim: "EX-V6",
        vin: "1HGCM82633A004352",
        nickname: "Commuter",
        mileage: 182000,
      },
      {
        id: 1,
        year: 2019,
        make: "Ford",
        model: "F-150",
        trim: null,
        vin: null,
        nickname: null,
        mileage: null,
      },
    ]);

    await renderPage();

    expect(screen.getByText("2 vehicles in your garage")).toBeInTheDocument();

    const [accord, ford] = screen.getAllByRole("listitem");

    expect(within(accord).getByText("2003 Honda Accord")).toBeInTheDocument();
    expect(within(accord).getByText("Commuter")).toBeInTheDocument();
    expect(within(accord).getByText("EX-V6")).toBeInTheDocument();
    expect(within(accord).getByText("182,000 mi")).toBeInTheDocument();
    expect(within(accord).getByText("1HGCM82633A004352")).toBeInTheDocument();

    expect(within(ford).getByText("2019 Ford F-150")).toBeInTheDocument();
    expect(within(ford).getAllByText("-")).toHaveLength(3);
  });

  it("confirms a newly added vehicle with a toast", async () => {
    serveVehicles([]);

    await renderPage("created");

    expect(await screen.findByText("Vehicle added")).toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledWith("/vehicles");
  });

  it("sends signed-out visitors to the login page", async () => {
    server.use(
      http.get(`${API_URL}/api/vehicles`, () =>
        HttpResponse.json({ error: "Unauthorized." }, { status: 401 }),
      ),
    );

    await expect(renderPage()).rejects.toThrow(RedirectError);
  });
});
