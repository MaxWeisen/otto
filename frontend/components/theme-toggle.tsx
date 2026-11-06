"use client";

import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="icon-lg"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-[calc(1rem+env(safe-area-inset-left))] z-40 size-11 rounded-full bg-background shadow-md duration-150 ease-out hover:shadow-glow focus-visible:shadow-glow motion-safe:hover:-translate-y-0.5 motion-safe:focus-visible:-translate-y-0.5 sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] sm:left-[calc(1.5rem+env(safe-area-inset-left))] dark:bg-background dark:hover:bg-muted"
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
