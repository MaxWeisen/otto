import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  MaintenanceTimeline,
  type TimelineRecord,
} from "@/components/maintenance-timeline";

function record(overrides: Partial<TimelineRecord>): TimelineRecord {
  return {
    id: 1,
    vehicle_id: 7,
    type: "oil_change",
    description: "Synthetic 5W-30 and filter",
    performed_at: "2026-05-09",
    mileage: null,
    cost: null,
    notes: null,
    created_at: "2026-05-09T17:00:00Z",
    ...overrides,
  };
}

const records = [
  record({
    id: 4,
    type: "repair",
    description: "Replaced washer reservoir",
    performed_at: "2026-10-12",
    mileage: 184300,
    cost: "1234.5",
  }),
  record({
    id: 3,
    type: "brakes",
    description: "Front pads and rotors",
    performed_at: "2026-01-18",
    notes: "Akebono ceramic pads.\nRear pads at 6mm.",
  }),
  record({
    id: 2,
    type: "inspection",
    description: "State inspection",
    performed_at: "2025-03-14",
  }),
];

function renderTimeline(items: TimelineRecord[] = records) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const user = userEvent.setup();

  render(
    <MaintenanceTimeline
      records={items}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  );

  return { user, onEdit, onDelete };
}

const yearGroup = (year: string) => screen.getByRole("region", { name: year });

describe("MaintenanceTimeline", () => {
  it("groups records by year, newest first", () => {
    renderTimeline();

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["2026", "2025"]);
    expect(
      within(yearGroup("2026"))
        .getAllByRole("listitem")
        .map((item) => within(item).getByText(/^(Repair|Brakes)$/).textContent),
    ).toEqual(["Repair", "Brakes"]);
    expect(
      within(yearGroup("2025")).getByText("State inspection"),
    ).toBeInTheDocument();
  });

  it("shows each entry's type, description, date, mileage and cost", () => {
    renderTimeline();

    const entry = within(yearGroup("2026")).getAllByRole("listitem")[0];

    expect(entry).toHaveTextContent("Repair");
    expect(entry).toHaveTextContent("Replaced washer reservoir");
    expect(within(entry).getByText("Oct 12")).toHaveAttribute(
      "datetime",
      "2026-10-12",
    );
    expect(within(entry).getByText("184,300 mi")).toBeInTheDocument();
    expect(within(entry).getByText("$1,234.50")).toBeInTheDocument();
  });

  it("leaves out mileage and cost a record does not have", () => {
    renderTimeline([records[2]]);

    expect(screen.queryByText(/ mi$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^\$/)).not.toBeInTheDocument();
  });

  it("keeps notes collapsed behind More and Less", async () => {
    const { user } = renderTimeline();

    const notes = screen.getByText(/Akebono ceramic pads/);
    const toggle = screen.getByRole("button", { name: "More" });

    expect(notes).not.toBeVisible();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", notes.id);

    await user.click(toggle);

    expect(notes).toBeVisible();
    expect(screen.getByRole("button", { name: "Less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Less" }));

    expect(notes).not.toBeVisible();
    expect(screen.getAllByRole("button", { name: "More" })).toHaveLength(1);
  });

  it("edits and deletes an entry from its labeled buttons", async () => {
    const { user, onEdit, onDelete } = renderTimeline();

    await user.click(
      screen.getByRole("button", { name: "Edit Brakes from Jan 18, 2026" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Delete Inspection from Mar 14, 2025",
      }),
    );

    expect(onEdit).toHaveBeenCalledWith(records[1]);
    expect(onDelete).toHaveBeenCalledWith(records[2]);
  });

  it("shows a pending entry as saving, without actions", () => {
    renderTimeline([record({ id: -1, pending: true })]);

    const entry = screen.getByRole("listitem");

    expect(entry).toHaveAttribute("aria-busy", "true");
    expect(entry).toHaveClass("opacity-60");
    expect(within(entry).getByText("Saving...")).toBeInTheDocument();
    expect(within(entry).queryByRole("button")).not.toBeInTheDocument();
  });
});
