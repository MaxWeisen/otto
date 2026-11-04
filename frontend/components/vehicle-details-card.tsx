"use client";

import { useState } from "react";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import type {
  DeleteVehicleState,
  VehicleFormState,
} from "@/app/(authenticated)/vehicles/actions";
import { DeleteVehicleDialog } from "@/components/delete-vehicle-dialog";
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
  /** Deletes the vehicle and leaves its page. */
  deleteAction: () => Promise<DeleteVehicleState>;
};

/**
 * A vehicle's details, which the edit button turns into a form in place.
 * Leaving the form returns focus to the edit button. The form's Delete button
 * asks for confirmation before deleting the vehicle.
 */
export function VehicleDetailsCard({
  vehicle,
  action,
  deleteAction,
}: VehicleDetailsCardProps) {
  const [editing, setEditing] = useState(false);
  const [hasEdited, setHasEdited] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function stopEditing() {
    setEditing(false);
    setHasEdited(true);
  }

  if (editing) {
    // The dialog sits beside the form rather than inside it, so its keys and
    // clicks do not reach the form's Escape and submit handling.
    return (
      <>
        <VehicleEditForm
          action={action}
          defaultValues={vehicleFormValues(vehicle)}
          onCancel={stopEditing}
          onSaved={stopEditing}
          onDelete={() => setConfirmingDelete(true)}
        />
        <DeleteVehicleDialog
          vehicle={vehicle}
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          action={deleteAction}
        />
      </>
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
