"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { SpinnerIcon } from "@phosphor-icons/react";
import type { DeleteVehicleState } from "@/app/(authenticated)/vehicles/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/vehicle-fields";
import type { Vehicle } from "@/lib/vehicles";

type DeleteVehicleDialogProps = {
  vehicle: Vehicle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Deletes the vehicle and leaves the page once it is gone. */
  action: () => Promise<DeleteVehicleState>;
};

/**
 * Asks for confirmation before deleting a vehicle. While the delete runs the
 * dialog stays open and cannot be dismissed; a failure is shown in the dialog
 * and as a toast so it can be retried or cancelled.
 */
export function DeleteVehicleDialog({
  vehicle,
  open,
  onOpenChange,
  action,
}: DeleteVehicleDialogProps) {
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();
  const confirmButton = useRef<HTMLButtonElement>(null);

  function confirm() {
    setMessage(undefined);
    startTransition(async () => {
      const result = await action();

      if (result.message) {
        const failure = result.message;

        // Shown together with the buttons becoming usable again.
        startTransition(() => setMessage(failure));
        toast.error(failure);
      }
    });
  }

  // The confirm button is disabled while deleting, so it can only take focus
  // back once a failed delete has finished.
  useEffect(() => {
    if (message) {
      confirmButton.current?.focus();
    }
  }, [message]);

  function handleOpenChange(nextOpen: boolean) {
    if (!pending) {
      onOpenChange(nextOpen);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) {
          setMessage(undefined);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {vehicle.year} {vehicle.make} {vehicle.model}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the vehicle and all of its maintenance
            records. It cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {message && <FormAlert message={message} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            ref={confirmButton}
            variant="destructive"
            onClick={confirm}
            disabled={pending}
          >
            {pending && (
              <SpinnerIcon
                data-icon="inline-start"
                className="animate-spin"
              />
            )}
            Delete vehicle
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
