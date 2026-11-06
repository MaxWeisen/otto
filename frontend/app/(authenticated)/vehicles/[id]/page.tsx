import type { Metadata } from "next";
import { MaintenanceSection } from "@/components/maintenance-section";
import { PageHeader } from "@/components/page-header";
import { VehicleDetailsCard } from "@/components/vehicle-details-card";
import { listMaintenanceRecords } from "@/lib/maintenance";
import { getVehicle } from "@/lib/vehicles";
import { deleteVehicleAction, updateVehicleAction } from "../actions";

type VehiclePageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: VehiclePageProps): Promise<Metadata> {
  const vehicle = await getVehicle((await params).id);

  return { title: `${vehicle.year} ${vehicle.make} ${vehicle.model} - Otto` };
}

export default async function VehiclePage({ params }: VehiclePageProps) {
  const { id } = await params;
  const [vehicle, records] = await Promise.all([
    getVehicle(id),
    listMaintenanceRecords(id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        backHref="/vehicles"
        backLabel="Back to vehicles"
        title={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
        description={vehicle.nickname}
      />
      <VehicleDetailsCard
        vehicle={vehicle}
        action={updateVehicleAction.bind(null, vehicle.id)}
        deleteAction={deleteVehicleAction.bind(null, vehicle.id)}
      />
      <MaintenanceSection
        vehicle={vehicle}
        records={records}
      />
    </div>
  );
}
