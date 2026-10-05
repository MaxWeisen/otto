import type { Metadata } from "next";
import Link from "next/link";
import { CarIcon, PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/page-header";
import { Toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { VehicleCard } from "@/components/vehicle-card";
import { listVehicles } from "@/lib/vehicles";

export const metadata: Metadata = { title: "Vehicles - Otto" };

const statusMessages: Record<string, string> = {
  created: "Vehicle added",
};

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const vehicles = await listVehicles();
  const statusMessage = status ? statusMessages[status] : undefined;

  const addVehicleButton = (
    <Button
      render={<Link href="/vehicles/new" />}
      nativeButton={false}
    >
      <PlusIcon />
      Add vehicle
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      {statusMessage && (
        <Toast
          message={statusMessage}
          type="success"
          clearParams
        />
      )}
      <PageHeader
        title="Vehicles"
        description={
          vehicles.length > 0
            ? `${vehicles.length} ${vehicles.length === 1 ? "vehicle" : "vehicles"} in your garage`
            : "Keep track of the vehicles you work on."
        }
        actions={vehicles.length > 0 && addVehicleButton}
      />
      {vehicles.length === 0 ? (
        <Empty className="border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CarIcon />
            </EmptyMedia>
            <EmptyTitle>No vehicles yet</EmptyTitle>
            <EmptyDescription>
              Add your first vehicle to start keeping track of its details and
              maintenance.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{addVehicleButton}</EmptyContent>
        </Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((vehicle) => (
            <li
              key={vehicle.id}
              className="flex"
            >
              <VehicleCard vehicle={vehicle} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
