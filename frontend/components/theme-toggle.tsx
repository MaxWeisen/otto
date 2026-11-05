"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is only known in the browser, so the server and the first
  // client render share a generic label.
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <Button
      variant="outline"
      size="icon-lg"
      aria-label={hydrated ? `Switch to ${nextTheme} theme` : "Toggle theme"}
      onClick={() => setTheme(nextTheme)}
      className="fixed right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 size-11 rounded-full bg-background shadow-md duration-150 ease-out hover:shadow-glow focus-visible:shadow-glow motion-safe:hover:-translate-y-0.5 motion-safe:focus-visible:-translate-y-0.5 sm:right-[calc(1.5rem+env(safe-area-inset-right))] sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] dark:bg-background dark:hover:bg-muted"
    >
      <MoonIcon
        className="size-5 dark:hidden"
        aria-hidden
      />
      <SunIcon
        className="hidden size-5 dark:block"
        aria-hidden
      />
    </Button>
  );
}
