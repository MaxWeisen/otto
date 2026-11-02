import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { VehicleDetailsCard } from "@/components/vehicle-details-card";
import { getVehicle } from "@/lib/vehicles";
import { updateVehicleAction } from "../actions";

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
  const vehicle = await getVehicle((await params).id);

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
      />
    </div>
  );
}
