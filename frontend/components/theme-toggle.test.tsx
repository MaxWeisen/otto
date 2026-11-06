import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTheme } from "next-themes";
import { describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/theme-toggle";

vi.mock("next-themes", () => ({ useTheme: vi.fn() }));

describe("ThemeToggle", () => {
  it.each([
    ["light", "dark"],
    ["dark", "light"],
  ])("switches from the %s theme to %s", async (current, next) => {
    const user = userEvent.setup();
    const setTheme = vi.fn();

    vi.mocked(useTheme).mockReturnValue({
      resolvedTheme: current,
      setTheme,
      themes: ["light", "dark"],
    });

    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Toggle theme" }));

    expect(setTheme).toHaveBeenCalledExactlyOnceWith(next);
  });
});
