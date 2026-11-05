import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTheme } from "next-themes";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/theme-toggle";

vi.mock("next-themes", () => ({ useTheme: vi.fn() }));

function mockTheme(resolvedTheme: string) {
  const setTheme = vi.fn();

  vi.mocked(useTheme).mockReturnValue({
    resolvedTheme,
    setTheme,
    themes: ["light", "dark"],
  });

  return setTheme;
}

describe("ThemeToggle", () => {
  it.each([
    ["light", "dark"],
    ["dark", "light"],
  ])("switches from the %s theme to %s", async (current, next) => {
    const user = userEvent.setup();
    const setTheme = mockTheme(current);

    render(<ThemeToggle />);

    await user.click(
      screen.getByRole("button", { name: `Switch to ${next} theme` }),
    );

    expect(setTheme).toHaveBeenCalledExactlyOnceWith(next);
  });

  it("renders a theme-neutral label on the server", () => {
    mockTheme("dark");

    const html = renderToString(<ThemeToggle />);

    expect(html).toContain('aria-label="Toggle theme"');
    expect(html).not.toContain("Switch to");
  });
});
