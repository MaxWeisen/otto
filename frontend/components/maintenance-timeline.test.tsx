import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MaintenanceTimeline } from "@/components/maintenance-timeline";
import type { MaintenanceRecord } from "@/lib/maintenance";

vi.mock("@/app/(authenticated)/vehicles/[id]/actions", () => ({
  updateMaintenanceRecordAction: vi.fn(),
  deleteMaintenanceRecordAction: vi.fn(),
}));

const brakes: MaintenanceRecord = {
  id: 31,
  vehicle_id: 7,
  type: "brakes",
  description: "Front pads and rotors",
  performed_at: "2026-01-18",
  mileage: null,
  cost: null,
  notes: null,
  created_at: "2026-01-18T17:00:00Z",
};

describe("MaintenanceTimeline", () => {
  it("groups records under their year", () => {
    const inspection = {
      ...brakes,
      id: 30,
      performed_at: "2025-03-14",
      description: "State inspection",
    };
    render(<MaintenanceTimeline records={[brakes, inspection]} />);

    expect(
      within(screen.getByRole("region", { name: "2026" })).getByText(
        "Front pads and rotors",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "2025" })).getByText(
        "State inspection",
      ),
    ).toBeInTheDocument();
  });
});
