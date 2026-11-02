"use client";

import { useState } from "react";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import type { VehicleFormState } from "@/app/(authenticated)/vehicles/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VehicleDetails } from "@/components/vehicle-details";
import {
  VehicleEditForm,
  vehicleFormValues,
} from "@/components/vehicle-edit-form";
import type { Vehicle } from "@/lib/vehicles";

type VehicleDetailsCardProps = {
  vehicle: Vehicle;
  /** Saves the edited vehicle. */
  action: (
    state: VehicleFormState,
    formData: FormData,
  ) => Promise<VehicleFormState>;
};

/**
 * A vehicle's details, which the edit button turns into a form in place.
 * Leaving the form returns focus to the edit button.
 */
export function VehicleDetailsCard({
  vehicle,
  action,
}: VehicleDetailsCardProps) {
  const [editing, setEditing] = useState(false);
  const [hasEdited, setHasEdited] = useState(false);

  function stopEditing() {
    setEditing(false);
    setHasEdited(true);
  }

  if (editing) {
    return (
      <VehicleEditForm
        action={action}
        defaultValues={vehicleFormValues(vehicle)}
        onCancel={stopEditing}
        onSaved={stopEditing}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
        <CardAction className="row-span-1 -my-1.5 -mr-1.5 flex">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setEditing(true)}
            autoFocus={hasEdited}
            aria-label="Edit vehicle"
          >
            <PencilSimpleIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <VehicleDetails
          vehicle={vehicle}
          variant="full"
          className="border-t pt-3"
        />
      </CardContent>
    </Card>
  );
}
