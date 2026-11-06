"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";
import { ArrowClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export type PageErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/** Shown when a page fails to load, with a way to try again. */
export function PageError({ error, reset }: PageErrorProps) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      className="border py-16"
      icon={<WarningCircleIcon />}
      title="Something went wrong"
      description="We couldn't load this page. Check your connection and try again."
      action={
        <Button
          onClick={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
        >
          <ArrowClockwiseIcon />
          Try again
        </Button>
      }
    />
  );
}
