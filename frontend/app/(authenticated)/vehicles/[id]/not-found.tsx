import Link from "next/link";
import { ArrowLeftIcon, CarIcon } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/** Shown for a vehicle that does not exist or belongs to someone else. */
export default function VehicleNotFound() {
  return (
    <EmptyState
      className="flex-none border py-16"
      icon={<CarIcon />}
      title="Vehicle not found"
      description="This vehicle doesn't exist or isn't in your garage."
      action={
        <Button
          render={<Link href="/vehicles" />}
          nativeButton={false}
        >
          <ArrowLeftIcon />
          Back to vehicles
        </Button>
      }
    />
  );
}
