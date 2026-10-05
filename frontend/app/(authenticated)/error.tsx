"use client";

import { PageError, type PageErrorProps } from "@/components/page-error";

/** Shown when a signed-in page fails to load, with a way to try again. */
export default function AuthenticatedError(props: PageErrorProps) {
  return <PageError {...props} />;
}
