import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VehicleDetails } from "@/components/vehicle-details";
import type { Vehicle } from "@/lib/vehicles";

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const name = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="break-words">{name}</CardTitle>
        {vehicle.nickname && (
          <CardDescription className="break-words">
            {vehicle.nickname}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="mt-auto">
        <VehicleDetails
          vehicle={vehicle}
          className="border-t pt-3"
        />
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/vehicles/${vehicle.id}`} />}
          nativeButton={false}
          aria-label={`Details for ${name}`}
        >
          Details
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  );
}
