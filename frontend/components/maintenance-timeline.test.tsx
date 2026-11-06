import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MaintenanceTimeline } from "@/components/maintenance-timeline";
import type { MaintenanceRecord } from "@/lib/maintenance";

const brakes: MaintenanceRecord = {
  id: 31,
  vehicle_id: 7,
  type: "brakes",
  description: "Front pads and rotors",
  performed_at: "2026-01-18",
  mileage: 176300,
  cost: "1234.5",
  notes: "Akebono ceramic pads.",
  created_at: "2026-01-18T17:00:00Z",
};

describe("MaintenanceTimeline", () => {
  it("groups records under their year, newest first", () => {
    const inspection = {
      ...brakes,
      id: 30,
      performed_at: "2025-03-14",
      description: "State inspection",
    };
    render(
      <MaintenanceTimeline
        records={[brakes, inspection]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

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

  it("shows the type, date, description, mileage and cost", () => {
    render(
      <MaintenanceTimeline
        records={[brakes]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const entry = screen.getByRole("listitem");
    expect(entry).toHaveTextContent("Brakes");
    expect(entry).toHaveTextContent("Jan 18");
    expect(entry).toHaveTextContent("Front pads and rotors");
    expect(entry).toHaveTextContent("176,300 mi");
    expect(entry).toHaveTextContent("$1,234.50");
  });

  it("shows notes behind More and hides them with Less", async () => {
    const user = userEvent.setup();
    render(
      <MaintenanceTimeline
        records={[brakes]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Akebono ceramic pads.")).not.toBeVisible();

    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByText("Akebono ceramic pads.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Less" }));
    expect(screen.getByText("Akebono ceramic pads.")).not.toBeVisible();
  });

  it("edits and deletes a record from its buttons", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <MaintenanceTimeline
        records={[brakes]}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Edit Brakes from Jan 18, 2026" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Delete Brakes from Jan 18, 2026" }),
    );

    expect(onEdit).toHaveBeenCalledWith(brakes);
    expect(onDelete).toHaveBeenCalledWith(brakes);
  });

  it("shows a pending record as saving, without actions", () => {
    render(
      <MaintenanceTimeline
        records={[{ ...brakes, pending: true }]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole("listitem")).toHaveTextContent("Saving...");
    expect(
      screen.queryByRole("button", { name: /^Edit/ }),
    ).not.toBeInTheDocument();
  });
});
