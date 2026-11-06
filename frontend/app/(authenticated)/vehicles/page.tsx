import type { Metadata } from "next";
import Link from "next/link";
import { CarIcon, PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { VehicleCard } from "@/components/vehicle-card";
import { listVehicles } from "@/lib/vehicles";

export const metadata: Metadata = { title: "Vehicles - Otto" };

const statusMessages: Record<string, string> = {
  created: "Vehicle added",
  deleted: "Vehicle deleted",
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
        <EmptyState
          className="border py-16"
          icon={<CarIcon />}
          title="No vehicles yet"
          description="Add your first vehicle to start keeping track of its details and maintenance."
          action={addVehicleButton}
        />
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
