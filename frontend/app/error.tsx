"use client";

import { PageError, type PageErrorProps } from "@/components/page-error";

/**
 * Shown when a page or a nested layout, such as the signed-in layout, fails
 * to load, with a way to try again.
 */
export default function RootError(props: PageErrorProps) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <PageError {...props} />
    </main>
  );
}
