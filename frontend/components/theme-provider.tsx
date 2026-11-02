"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// next-themes applies the saved theme before paint with an inline script that
// only runs from server-rendered HTML. When React renders the tree in the
// browser instead, as Next does for not-found and error pages, the script can
// never run, so it is marked as a data block for React to create it without
// warning. Hydration keeps the server's executable script.
const scriptProps =
  typeof window === "undefined" ? undefined : { type: "application/json" };

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      scriptProps={scriptProps}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
