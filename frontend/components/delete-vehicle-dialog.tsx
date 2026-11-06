"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";
import type { DeleteVehicleState } from "@/app/(authenticated)/vehicles/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormAlert } from "@/components/vehicle-fields";
import type { Vehicle } from "@/lib/vehicles";

type DeleteVehicleDialogProps = {
  vehicle: Vehicle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: () => Promise<DeleteVehicleState>;
};

export function DeleteVehicleDialog({
  vehicle,
  open,
  onOpenChange,
  action,
}: DeleteVehicleDialogProps) {
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) {
      setMessage(undefined);
    }
  }

  function confirm() {
    setMessage(undefined);
    startTransition(async () => {
      let failure: string | undefined;

      try {
        failure = (await action()).message;
      } catch (error) {
        unstable_rethrow(error);
        failure = "Could not reach the server. Please try again.";
      }

      if (failure) {
        // A nested transition so the message commits with pending turning false.
        startTransition(() => setMessage(failure));
        toast.error(failure);
      }
    });
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${vehicle.year} ${vehicle.make} ${vehicle.model}?`}
      description="This permanently deletes the vehicle and all of its maintenance records. It cannot be undone."
      confirmLabel="Delete vehicle"
      destructive
      pending={pending}
      onConfirm={confirm}
    >
      {message && <FormAlert message={message} />}
    </ConfirmDialog>
  );
}
