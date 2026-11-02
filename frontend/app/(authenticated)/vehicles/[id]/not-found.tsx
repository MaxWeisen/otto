import Link from "next/link";
import { ArrowLeftIcon, CarIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/** Shown for a vehicle that does not exist or belongs to someone else. */
export default function VehicleNotFound() {
  return (
    <Empty className="flex-none border py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CarIcon />
        </EmptyMedia>
        <EmptyTitle>Vehicle not found</EmptyTitle>
        <EmptyDescription>
          This vehicle doesn&apos;t exist or isn&apos;t in your garage.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          render={<Link href="/vehicles" />}
          nativeButton={false}
        >
          <ArrowLeftIcon />
          Back to vehicles
        </Button>
      </EmptyContent>
    </Empty>
  );
}
