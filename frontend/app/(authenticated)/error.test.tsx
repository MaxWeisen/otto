import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { router } from "@/test/next-mocks";
import AuthenticatedError from "./error";

describe("AuthenticatedError", () => {
  it("explains the failure and tries again", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <AuthenticatedError
        error={new Error("Backend down")}
        reset={reset}
      />,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
