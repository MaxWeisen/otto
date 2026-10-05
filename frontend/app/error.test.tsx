import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { router } from "@/test/next-mocks";
import RootError from "./error";

describe("RootError", () => {
  it("explains the failure and tries again", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    const error = new Error("Backend down");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <RootError
        error={error}
        reset={reset}
      />,
    );

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(error);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
