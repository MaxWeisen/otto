"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { unstable_rethrow } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import type { MaintenanceFormState } from "@/app/(authenticated)/vehicles/[id]/actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormAlert } from "@/components/vehicle-fields";
import type { MaintenanceRecord } from "@/lib/maintenance";
import {
  MAINTENANCE_TYPE_LABELS,
  formatRecordName,
  mileageFormatter,
} from "@/lib/maintenance-format";

type Props = {
  record?: MaintenanceRecord;
  defaultMileage?: number | null;
  action: (
    state: MaintenanceFormState,
    formData: FormData,
  ) => Promise<MaintenanceFormState>;
  onClose: () => void;
};

export function MaintenanceRecordForm({
  record,
  defaultMileage = null,
  action,
  onClose,
}: Props) {
  const form = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (previous: MaintenanceFormState, formData: FormData) => {
      const next = await action(previous, formData).catch(
        (error): MaintenanceFormState => {
          unstable_rethrow(error);
          return {
            values: Object.fromEntries(formData) as Record<string, string>,
            message: "Could not reach the server. Please try again.",
          };
        },
      );

      if (next.saved) {
        toast.success(`Maintenance record ${record ? "updated" : "added"}`);
        onClose();
      }

      return next;
    },
    {},
  );

  useEffect(() => {
    form.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
  }, [state]);

  const mileage = record ? record.mileage : defaultMileage;
  const values = state.values ?? {
    type: record?.type ?? "",
    performed_at: record?.performed_at ?? format(new Date(), "yyyy-MM-dd"),
    description: record?.description ?? "",
    mileage: mileage === null ? "" : mileageFormatter.format(mileage),
    cost: record?.cost ?? "",
    notes: record?.notes ?? "",
  };
  const errors = state.errors ?? {};
  const title = record ? "Edit maintenance record" : "Add maintenance record";

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !pending && onClose()}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {record
              ? formatRecordName(record)
              : "Log service done on this vehicle."}
          </DialogDescription>
        </DialogHeader>
        <form
          ref={form}
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(() => formAction(formData));
          }}
          aria-label={title}
          className="grid gap-4 sm:grid-cols-2"
        >
          <FormField
            label="Type"
            error={errors.type}
          >
            <NativeSelect
              name="type"
              defaultValue={values.type}
              className="w-full"
            >
              <NativeSelectOption value="">Choose a type</NativeSelectOption>
              {Object.entries(MAINTENANCE_TYPE_LABELS).map(([value, label]) => (
                <NativeSelectOption
                  key={value}
                  value={value}
                >
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
          <FormField
            label="Date"
            error={errors.performed_at}
          >
            <Input
              type="date"
              name="performed_at"
              defaultValue={values.performed_at}
            />
          </FormField>
          <FormField
            className="sm:col-span-2"
            label="Description"
            error={errors.description}
          >
            <Input
              name="description"
              autoComplete="off"
              defaultValue={values.description}
            />
          </FormField>
          <FormField
            label="Mileage"
            error={errors.mileage}
            optional
          >
            <Input
              name="mileage"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={values.mileage}
            />
          </FormField>
          <FormField
            label="Cost"
            error={errors.cost}
            optional
          >
            <Input
              name="cost"
              inputMode="decimal"
              autoComplete="off"
              defaultValue={values.cost}
            />
          </FormField>
          <FormField
            className="sm:col-span-2"
            label="Notes"
            error={errors.notes}
            optional
          >
            <Textarea
              name="notes"
              className="max-h-48"
              defaultValue={values.notes}
            />
          </FormField>
          {state.message && (
            <div className="sm:col-span-2">
              <FormAlert message={state.message} />
            </div>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending}
            >
              {pending ? "Saving..." : record ? "Save" : "Add record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
