import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Vehicle } from "@/lib/vehicles";

const mileageFormatter = new Intl.NumberFormat("en-US");

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="break-words">
          {vehicle.year} {vehicle.make} {vehicle.model}
        </CardTitle>
        {vehicle.nickname && (
          <CardDescription className="break-words">
            {vehicle.nickname}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="mt-auto">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t pt-3">
          <VehicleDetail label="Trim">{vehicle.trim}</VehicleDetail>
          <VehicleDetail label="Mileage">
            {vehicle.mileage !== null &&
              `${mileageFormatter.format(vehicle.mileage)} mi`}
          </VehicleDetail>
          <VehicleDetail label="VIN">
            {vehicle.vin && (
              <span className="tracking-wider">{vehicle.vin}</span>
            )}
          </VehicleDetail>
        </dl>
      </CardContent>
    </Card>
  );
}

function VehicleDetail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right">
        {children || <span className="text-muted-foreground">-</span>}
      </dd>
    </>
  );
}
