import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "./theme-provider";

describe("ThemeProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders in the browser without a script React warns about", () => {
    const consoleError = vi.spyOn(console, "error");

    const { container } = render(
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
      >
        <p>Page</p>
      </ThemeProvider>,
    );

    expect(container.querySelector("script")).toHaveAttribute(
      "type",
      "application/json",
    );
    expect(consoleError).not.toHaveBeenCalled();
  });
});
