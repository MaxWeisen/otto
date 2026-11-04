"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  SpinnerIcon,
} from "@phosphor-icons/react";
import type { VehicleFormState } from "@/app/(authenticated)/vehicles/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
  VinDecodeField,
} from "@/components/vehicle-fields";
import { cn } from "@/lib/utils";
import {
  MAX_TEXT_LENGTH,
  readVehicleFormValues,
  validateVehicleFields,
  validateVehicleForm,
  VEHICLE_FORM_STEPS,
  type VehicleField,
  type VehicleFormValues,
} from "@/lib/vehicle-schema";

const STEP_HEADINGS = [
  {
    title: "The basics",
    description: "Year, make and model are required.",
  },
  {
    title: "A few more details",
    description: "All optional. You can fill these in later.",
  },
];

type VehicleFormProps = {
  action: (
    state: VehicleFormState,
    formData: FormData,
  ) => Promise<VehicleFormState>;
  defaultValues: VehicleFormValues;
  submitLabel: string;
  cancelHref: string;
};

function stepOf(field: VehicleField): number {
  return VEHICLE_FORM_STEPS.findIndex((fields) =>
    (fields as readonly VehicleField[]).includes(field),
  );
}

/** The add-vehicle wizard, which collects a vehicle's fields in two steps. */
export function VehicleForm({
  action,
  defaultValues,
  submitLabel,
  cancelHref,
}: VehicleFormProps) {
  const [state, formAction, pending] = useActionState(action, {
    values: defaultValues,
  });
  const [step, setStep] = useState(0);
  // A field error returns the wizard to the first step that has a problem.
  const fields = useVehicleFields({
    defaultValues,
    state,
    fieldOrder: VEHICLE_FORM_STEPS.flat(),
    onInvalidField: (field) => setStep(stepOf(field)),
  });

  function goToStep(nextStep: number) {
    flushSync(() => setStep(nextStep));
    focusVehicleField(VEHICLE_FORM_STEPS[nextStep][0]);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const formValues = readVehicleFormValues(new FormData(event.currentTarget));

    if (step < VEHICLE_FORM_STEPS.length - 1) {
      event.preventDefault();

      const stepErrors = validateVehicleFields(
        formValues,
        VEHICLE_FORM_STEPS[step],
      );

      if (stepErrors) {
        fields.showErrors(stepErrors);
        return;
      }

      fields.clearErrors();
      goToStep(step + 1);
      return;
    }

    const validation = validateVehicleForm(formValues);

    if (!validation.success) {
      event.preventDefault();
      fields.showErrors(validation.errors);
      return;
    }

    fields.clearErrors();
  }

  const { textFieldProps } = fields;
  const isLastStep = step === VEHICLE_FORM_STEPS.length - 1;

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      noValidate
    >
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-4">
            <p
              className="text-xs text-muted-foreground"
              aria-live="polite"
            >
              Step {step + 1} of {VEHICLE_FORM_STEPS.length}
            </p>
            <div
              className="flex gap-1"
              aria-hidden
            >
              {VEHICLE_FORM_STEPS.map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-1 w-8 transition-colors",
                    index <= step ? "bg-primary" : "bg-foreground/15",
                  )}
                />
              ))}
            </div>
          </div>
          <CardTitle className="mt-2">{STEP_HEADINGS[step].title}</CardTitle>
          <CardDescription>{STEP_HEADINGS[step].description}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup hidden={step !== 0}>
            <VinDecodeField fields={fields} />
            <div className="grid gap-5 sm:grid-cols-[7rem_minmax(0,1fr)]">
              <VehicleTextField
                label="Year"
                inputMode="numeric"
                maxLength={4}
                placeholder="e.g. 2019"
                required
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
          </FieldGroup>
          <FieldGroup hidden={step !== 1}>
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
          </FieldGroup>
          {state.message && isLastStep && (
            <FormAlert
              message={state.message}
              className="mt-5"
            />
          )}
        </CardContent>
        <CardFooter className="justify-between gap-2">
          {step === 0 ? (
            <Button
              key="cancel"
              variant="outline"
              render={<Link href={cancelHref} />}
              nativeButton={false}
            >
              Cancel
            </Button>
          ) : (
            <Button
              key="back"
              type="button"
              variant="outline"
              onClick={() => goToStep(step - 1)}
              disabled={pending}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              Back
            </Button>
          )}
          {isLastStep ? (
            <Button
              key="submit"
              type="submit"
              disabled={pending}
            >
              {pending && (
                <SpinnerIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              )}
              {submitLabel}
            </Button>
          ) : (
            <Button
              key="next"
              type="submit"
            >
              Next
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          )}
        </CardFooter>
      </Card>
    </form>
  );
}
