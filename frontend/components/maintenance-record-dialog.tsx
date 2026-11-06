"use client";

import { useActionState, useLayoutEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";
import { SpinnerIcon } from "@phosphor-icons/react";
import type { MaintenanceFormState } from "@/app/(authenticated)/vehicles/[id]/actions";
import {
  MaintenanceRecordFields,
  firstInvalidInput,
} from "@/components/maintenance-record-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormAlert } from "@/components/vehicle-fields";
import type { MaintenanceRecord } from "@/lib/maintenance";
import { formatRecordName } from "@/lib/maintenance-format";
import {
  maintenanceFormValues,
  readMaintenanceFormValues,
  validateMaintenanceForm,
  type MaintenanceFieldErrors,
} from "@/lib/maintenance-schema";

type MaintenanceRecordDialogProps = {
  record?: MaintenanceRecord;
  defaultMileage?: number | null;
  action: (
    state: MaintenanceFormState,
    formData: FormData,
  ) => Promise<MaintenanceFormState>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MaintenanceRecordDialog({
  record,
  defaultMileage = null,
  action,
  open,
  onOpenChange,
}: MaintenanceRecordDialogProps) {
  const [initialState] = useState<MaintenanceFormState>(() => ({
    values: maintenanceFormValues(record, defaultMileage),
  }));
  const [state, formAction, pending] = useActionState(
    async (previous: MaintenanceFormState, formData: FormData) => {
      let next: MaintenanceFormState;

      try {
        next = await action(previous, formData);
      } catch (error) {
        unstable_rethrow(error);
        next = {
          values: readMaintenanceFormValues(formData),
          message: "Could not reach the server. Please try again.",
        };
      }

      if (next.saved) {
        toast.success(`Maintenance record ${record ? "updated" : "added"}`);

        if (record) {
          onOpenChange(false);
        }
      } else if (!record) {
        toast.error("Could not add the record", {
          description:
            next.message ?? Object.values(next.errors ?? {}).flat()[0],
          action: { label: "Try again", onClick: () => onOpenChange(true) },
        });
      } else if (next.gone) {
        toast.error(next.message);
      }

      return next;
    },
    initialState,
  );

  const [clientErrors, setClientErrors] = useState<MaintenanceFieldErrors>();
  // The inputs are uncontrolled, so the form remounts to show new values.
  const [shown, setShown] = useState({ state, open });
  const [formKey, setFormKey] = useState(0);

  if (state !== shown.state || open !== shown.open) {
    setShown({ state, open });
    setFormKey(formKey + 1);
    setClientErrors(undefined);
  }

  useLayoutEffect(() => firstInvalidInput(state.errors)?.focus(), [state]);

  const values =
    state === initialState || state.saved
      ? maintenanceFormValues(record, defaultMileage)
      : state.values;
  const errors = clientErrors ?? (state.saved ? undefined : state.errors);
  const title = record ? "Edit maintenance record" : "Add maintenance record";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const validation = validateMaintenanceForm(
      readMaintenanceFormValues(new FormData(event.currentTarget)),
    );

    if (!validation.success) {
      event.preventDefault();
      setClientErrors(validation.errors);
      firstInvalidInput(validation.errors)?.focus();
    } else if (!record) {
      onOpenChange(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
        initialFocus={() => firstInvalidInput(errors) ?? true}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {record
              ? formatRecordName(record)
              : "Log service done on this vehicle."}
          </DialogDescription>
        </DialogHeader>
        <form
          key={formKey}
          action={formAction}
          onSubmit={handleSubmit}
          aria-label={title}
          noValidate
          className="flex flex-col gap-4"
        >
          <MaintenanceRecordFields
            values={values}
            errors={errors}
          />
          {!state.saved && state.message && (
            <FormAlert message={state.message} />
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <SubmitButton label={record ? "Save" : "Add record"} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
    >
      {pending && (
        <SpinnerIcon
          data-icon="inline-start"
          className="animate-spin"
        />
      )}
      {pending ? "Saving..." : label}
    </Button>
  );
}
