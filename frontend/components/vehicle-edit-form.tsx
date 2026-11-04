"use client";

import { useActionState, useEffectEvent, useLayoutEffect, useRef } from "react";
import { toast } from "sonner";
import { SpinnerIcon } from "@phosphor-icons/react";
import type { VehicleFormState } from "@/app/(authenticated)/vehicles/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import {
  focusVehicleField,
  FormAlert,
  MakeField,
  ModelField,
  useVehicleFields,
  VehicleTextField,
  VinTextField,
} from "@/components/vehicle-fields";
import {
  MAX_TEXT_LENGTH,
  readVehicleFormValues,
  validateVehicleForm,
  type VehicleField,
  type VehicleFormValues,
} from "@/lib/vehicle-schema";
import type { Vehicle } from "@/lib/vehicles";

const FIELD_ORDER: readonly VehicleField[] = [
  "year",
  "make",
  "model",
  "trim",
  "vin",
  "mileage",
  "nickname",
];

const mileageFormatter = new Intl.NumberFormat("en-US");

/** A saved vehicle's fields as the vehicle form shows them. */
export function vehicleFormValues(vehicle: Vehicle): VehicleFormValues {
  return {
    year: String(vehicle.year),
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim ?? "",
    nickname: vehicle.nickname ?? "",
    mileage:
      vehicle.mileage === null ? "" : mileageFormatter.format(vehicle.mileage),
    vin: vehicle.vin ?? "",
  };
}

type VehicleEditFormProps = {
  action: (
    state: VehicleFormState,
    formData: FormData,
  ) => Promise<VehicleFormState>;
  defaultValues: VehicleFormValues;
  onCancel: () => void;
  onSaved: () => void;
  onDelete: () => void;
};

/**
 * Edits all of a saved vehicle's fields in place of its details card. Escape
 * cancels, like the Cancel button.
 */
export function VehicleEditForm({
  action,
  defaultValues,
  onCancel,
  onSaved,
  onDelete,
}: VehicleEditFormProps) {
  const [state, formAction, pending] = useActionState(action, {
    values: defaultValues,
  });
  const fields = useVehicleFields({
    defaultValues,
    state,
    fieldOrder: FIELD_ORDER,
  });
  const saveButton = useRef<HTMLButtonElement>(null);

  // Focus follows the outcome of a save: back to read mode once it worked,
  // otherwise to the first field with an error, or back to Save. It moves in
  // the same commit that shows the outcome, before the browser paints.
  const handleResult = useEffectEvent((result: VehicleFormState) => {
    if (result.saved) {
      toast.success("Vehicle updated");
      onSaved();
      return;
    }

    const invalid = result.errors && fields.firstInvalidField(result.errors);

    if (invalid) {
      focusVehicleField(invalid);
    } else if (result.message) {
      saveButton.current?.focus();
    }
  });

  useLayoutEffect(() => {
    handleResult(state);
  }, [state]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const validation = validateVehicleForm(
      readVehicleFormValues(new FormData(event.currentTarget)),
    );

    if (!validation.success) {
      event.preventDefault();
      fields.showErrors(validation.errors);
      return;
    }

    fields.clearErrors();
  }

  // Escape cancels before a make or model picker sees it, since a picker
  // clears its value on Escape. An Escape that closes an open list is left
  // to the picker.
  function handleKeyDownCapture(event: React.KeyboardEvent<HTMLFormElement>) {
    const target = event.target as HTMLElement;

    if (
      event.key === "Escape" &&
      target.getAttribute("aria-expanded") !== "true" &&
      !pending
    ) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  }

  const { textFieldProps } = fields;

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      onKeyDownCapture={handleKeyDownCapture}
      aria-label="Edit vehicle"
      noValidate
    >
      <Card>
        <CardHeader>
          <CardTitle>Edit details</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup className="border-t pt-4">
            <div className="grid gap-5 sm:grid-cols-[7rem_minmax(0,1fr)]">
              <VehicleTextField
                label="Year"
                inputMode="numeric"
                maxLength={4}
                placeholder="e.g. 2019"
                required
                autoFocus
                {...textFieldProps("year")}
              />
              <MakeField fields={fields} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <ModelField fields={fields} />
              <VehicleTextField
                label="Trim"
                placeholder="e.g. EX-L"
                maxLength={MAX_TEXT_LENGTH}
                {...textFieldProps("trim")}
              />
            </div>
            <VinTextField fields={fields} />
            <div className="grid gap-5 sm:grid-cols-2">
              <VehicleTextField
                label="Mileage"
                inputMode="numeric"
                placeholder="e.g. 84,500"
                {...textFieldProps("mileage")}
              />
              <VehicleTextField
                label="Nickname"
                placeholder="e.g. Daily driver"
                maxLength={MAX_TEXT_LENGTH}
                {...textFieldProps("nickname")}
              />
            </div>
            {state.message && <FormAlert message={state.message} />}
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-between gap-2">
          <Button
            type="button"
            variant="destructive"
            onClick={onDelete}
            disabled={pending}
          >
            Delete
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              ref={saveButton}
              type="submit"
              disabled={pending}
            >
              {pending && (
                <SpinnerIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              )}
              Save
            </Button>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}
