import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/empty-state";

describe("EmptyState", () => {
  it("shows the title, description and action", () => {
    render(
      <EmptyState
        icon={<svg />}
        title="No vehicles yet"
        description="Add your first vehicle."
        action={<button type="button">Add vehicle</button>}
      />,
    );

    expect(screen.getByText("No vehicles yet")).toBeInTheDocument();
    expect(screen.getByText("Add your first vehicle.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add vehicle" }),
    ).toBeInTheDocument();
  });
});
