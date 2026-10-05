"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";
import { ArrowClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

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
    <Empty className="border py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <WarningCircleIcon />
        </EmptyMedia>
        <EmptyTitle>Something went wrong</EmptyTitle>
        <EmptyDescription>
          We couldn&apos;t load this page. Check your connection and try again.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
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
      </EmptyContent>
    </Empty>
  );
}
