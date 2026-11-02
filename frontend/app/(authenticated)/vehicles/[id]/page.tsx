import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VehicleDetails } from "@/components/vehicle-details";
import { getVehicle } from "@/lib/vehicles";

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
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <VehicleDetails
            vehicle={vehicle}
            variant="full"
            className="border-t pt-3"
          />
        </CardContent>
      </Card>
    </div>
  );
}
