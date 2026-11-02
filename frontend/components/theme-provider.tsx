"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * next-themes' provider. Next renders not-found and error pages in the
 * browser instead of hydrating them, where next-themes' inline theme script
 * can never run and React warns about it, so the browser copy is marked as
 * an inert data block. Server-rendered pages keep the executable script, and
 * any scriptProps a caller passes are kept.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      {...props}
      scriptProps={
        typeof window === "undefined"
          ? props.scriptProps
          : { ...props.scriptProps, type: "application/json" }
      }
    >
      {children}
    </NextThemesProvider>
  );
}
