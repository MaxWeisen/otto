"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

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
