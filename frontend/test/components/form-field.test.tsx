import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormField } from "@/components/form-field";

describe("FormField", () => {
  it("labels its control and describes it with the error", () => {
    render(
      <FormField
        label="Cost"
        error="Cost must not be negative"
        optional
      >
        <input name="cost" />
      </FormField>,
    );

    const input = screen.getByRole("textbox", { name: /^Cost/ });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Cost must not be negative");
  });
});
