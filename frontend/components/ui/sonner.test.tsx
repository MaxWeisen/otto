import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/components/theme-provider";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";

// The only test that renders real toasts. Every other test sees sonner's
// toast as spies, set up in test/setup.ts.
vi.unmock("sonner");

afterEach(() => {
  act(() => {
    toast.dismiss();
  });
  localStorage.clear();
});

function renderToaster(theme: string) {
  render(
    <ThemeProvider
      attribute="class"
      defaultTheme={theme}
    >
      <Toaster />
    </ThemeProvider>,
  );
}

describe("Toaster", () => {
  it("shows a toast with the app's styling and icon", async () => {
    renderToaster("light");

    act(() => {
      toast.success("Vehicle updated");
    });

    const message = await screen.findByText("Vehicle updated");
    const item = message.closest("[data-sonner-toast]");

    expect(message).toBeVisible();
    expect(item).toHaveAttribute("data-type", "success");
    expect(item).toHaveClass("cn-toast", "font-mono", "text-xs");
    expect(item?.querySelector("[data-icon] svg")).toBeInTheDocument();

    const toaster = item?.closest("[data-sonner-toaster]");

    expect(toaster).toHaveClass("toaster", "group");
    expect(toaster).toHaveStyle({
      "--normal-bg": "var(--popover)",
      "--normal-text": "var(--popover-foreground)",
      "--normal-border": "var(--border)",
      "--border-radius": "0px",
    });
  });

  it.each(["light", "dark"])("follows the %s theme", async (theme) => {
    renderToaster(theme);

    act(() => {
      toast.error("Something went wrong");
    });

    const message = await screen.findByText("Something went wrong");

    expect(message.closest("[data-sonner-toaster]")).toHaveAttribute(
      "data-sonner-theme",
      theme,
    );
  });
});
