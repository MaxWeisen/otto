"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { VehicleFormState } from "@/app/(authenticated)/vehicles/actions";
import { OptionCombobox, OTHER_OPTION } from "@/components/option-combobox";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useVehicleModels } from "@/hooks/use-vehicle-models";
import { cn } from "@/lib/utils";
import { findVehicleMake, VEHICLE_MAKES } from "@/lib/vehicle-makes";
import {
  MAX_TEXT_LENGTH,
  readVehicleFormValues,
  validateVehicleFields,
  validateVehicleForm,
  VEHICLE_FORM_STEPS,
  vinError,
  VIN_LENGTH,
  type VehicleField,
  type VehicleFieldErrors,
  type VehicleFormValues,
} from "@/lib/vehicle-schema";
import {
  decodeVin,
  loadVehicleModels,
  type DecodedVin,
} from "@/lib/vpic-client";

const OTHER_LABEL = "Other / not listed";

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

function firstInvalidField(errors: VehicleFieldErrors) {
  return VEHICLE_FORM_STEPS.flat().find((field) => errors[field]);
}

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
  const [values, setValues] = useState(defaultValues);
  const [makeOther, setMakeOther] = useState(
    () => defaultValues.make !== "" && !findVehicleMake(defaultValues.make),
  );
  const [modelOther, setModelOther] = useState(false);
  const [focusOther, setFocusOther] = useState<"make" | "model" | null>(null);
  const [clientErrors, setClientErrors] = useState<VehicleFieldErrors | null>(
    null,
  );
  const [editedFields, setEditedFields] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [handledState, setHandledState] = useState(state);

  // A new server response replaces any client-side errors and returns the
  // wizard to the first step that has a problem.
  if (state !== handledState) {
    setHandledState(state);
    setClientErrors(null);
    setEditedFields(new Set());

    const invalid = state.errors && firstInvalidField(state.errors);

    if (invalid) {
      setStep(stepOf(invalid));
    }
  }

  useEffect(() => {
    if (state.message) {
      toast.error(state.message);
    }
  }, [state]);

  const listedMake = makeOther ? null : (findVehicleMake(values.make) ?? null);
  const lookupYear = validateVehicleFields(values, ["year"])
    ? null
    : Number(values.year);
  const modelsState = useVehicleModels(listedMake, lookupYear);
  const modelOptions = modelsState.status === "ready" ? modelsState.models : [];

  // A model picked from the list no longer fits once the year or make
  // changes to one whose list does not include it.
  if (
    modelOptions.length > 0 &&
    !modelOther &&
    values.model !== "" &&
    !modelOptions.includes(values.model)
  ) {
    setValues({ ...values, model: "" });
  }

  const errors = clientErrors ?? state.errors ?? {};
  const errorFor = (field: VehicleField) =>
    editedFields.has(field) ? undefined : errors[field]?.[0];

  function markEdited(...fields: VehicleField[]) {
    setEditedFields((current) => new Set([...current, ...fields]));
  }

  function setField(field: VehicleField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    markEdited(field);
  }

  function selectMake(next: string | null, typedText: string) {
    const isOther = next === OTHER_OPTION;

    setMakeOther(isOther);
    setModelOther(false);
    setFocusOther(isOther ? "make" : null);
    setValues((current) => ({
      ...current,
      make: isOther ? typedText : (next ?? ""),
      model: next === current.make ? current.model : "",
    }));
    markEdited("make");
  }

  function selectModel(next: string | null, typedText: string) {
    const isOther = next === OTHER_OPTION;

    setModelOther(isOther);
    setFocusOther(isOther ? "model" : null);
    setValues((current) => ({
      ...current,
      model: isOther ? typedText : (next ?? ""),
    }));
    markEdited("model");
  }

  /** Fills the form from a decoded VIN and returns a summary of what changed. */
  async function applyDecodedVin(decoded: DecodedVin): Promise<string> {
    const listed = decoded.make ? findVehicleMake(decoded.make) : undefined;
    const makeName = listed ?? decoded.make;
    let model = decoded.model;
    let isModelOther = true;

    if (listed && decoded.year && model) {
      try {
        const models = await loadVehicleModels(listed, decoded.year);
        const match = models.find(
          (option) => option.toLowerCase() === model?.toLowerCase(),
        );

        model = match ?? model;
        isModelOther = !match;
      } catch {
        // The decoded model stays as free text when the list cannot load.
      }
    }

    if (decoded.make) {
      setMakeOther(!listed);
    }

    if (model) {
      setModelOther(isModelOther);
    }

    setFocusOther(null);
    setValues((current) => ({
      ...current,
      year: decoded.year ? String(decoded.year) : current.year,
      make: makeName ?? current.make,
      model: model ?? (decoded.make ? "" : current.model),
      trim: decoded.trim ?? current.trim,
      vin: decoded.vin,
    }));
    markEdited("year", "make", "model", "trim", "vin");

    return [decoded.year, makeName, model, decoded.trim]
      .filter(Boolean)
      .join(" ");
  }

  function focusField(field: VehicleField) {
    const input =
      document.getElementById(`vehicle-${field}-other`) ??
      document.getElementById(`vehicle-${field}`);

    input?.focus();
  }

  function showErrors(fieldErrors: VehicleFieldErrors) {
    const invalid = firstInvalidField(fieldErrors);

    flushSync(() => {
      setClientErrors(fieldErrors);
      setEditedFields(new Set());

      if (invalid) {
        setStep(stepOf(invalid));
      }
    });

    if (invalid) {
      focusField(invalid);
    }
  }

  function goToStep(nextStep: number) {
    flushSync(() => setStep(nextStep));
    focusField(VEHICLE_FORM_STEPS[nextStep][0]);
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
        showErrors(stepErrors);
        return;
      }

      setClientErrors(null);
      goToStep(step + 1);
      return;
    }

    const validation = validateVehicleForm(formValues);

    if (!validation.success) {
      event.preventDefault();
      showErrors(validation.errors);
      return;
    }

    setClientErrors(null);
    setEditedFields(new Set());
  }

  const textFieldProps = (field: VehicleField) => ({
    name: field,
    value: values[field],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setField(field, event.target.value),
    error: errorFor(field),
  });

  const isLastStep = step === VEHICLE_FORM_STEPS.length - 1;
  const makeError = errorFor("make");
  const modelError = errorFor("model");

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
            <VinField
              value={values.vin}
              onChange={(value) => setField("vin", value)}
              error={errorFor("vin")}
              onDecoded={applyDecodedVin}
            />
            <div className="grid gap-5 sm:grid-cols-[7rem_minmax(0,1fr)]">
              <VehicleTextField
                label="Year"
                inputMode="numeric"
                maxLength={4}
                placeholder="e.g. 2019"
                required
                {...textFieldProps("year")}
              />
              <Field data-invalid={makeError ? true : undefined}>
                <FieldLabel htmlFor="vehicle-make">Make</FieldLabel>
                <OptionCombobox
                  id="vehicle-make"
                  options={VEHICLE_MAKES}
                  value={makeOther ? OTHER_OPTION : listedMake}
                  onSelect={selectMake}
                  onType={() => markEdited("make")}
                  otherLabel={OTHER_LABEL}
                  placeholder="Search makes"
                  invalid={!!makeError && !makeOther}
                  describedBy={
                    makeError && !makeOther ? "vehicle-make-error" : undefined
                  }
                />
                {makeOther ? (
                  <OtherTextInput
                    field="make"
                    label="Make name"
                    placeholder="Enter the make"
                    value={values.make}
                    onChange={(value) => setField("make", value)}
                    autoFocus={focusOther === "make"}
                    error={makeError}
                  />
                ) : (
                  <input
                    type="hidden"
                    name="make"
                    value={listedMake ?? ""}
                  />
                )}
                {makeError && (
                  <FieldError id="vehicle-make-error">{makeError}</FieldError>
                )}
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <ModelField
                state={modelsState}
                options={modelOptions}
                makeName={listedMake}
                year={lookupYear}
                makeOther={makeOther}
                modelOther={modelOther}
                value={values.model}
                onSelect={selectModel}
                onType={() => markEdited("model")}
                onChange={(value) => setField("model", value)}
                onFreeTextChange={(value) => {
                  setModelOther(value !== "");
                  setField("model", value);
                }}
                autoFocusOther={focusOther === "model"}
                error={modelError}
              />
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
            <div
              role="alert"
              className="mt-5 flex items-start gap-2 border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            >
              <WarningCircleIcon className="mt-px size-4 shrink-0" />
              <span>{state.message}</span>
            </div>
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

type ModelFieldProps = {
  state: ReturnType<typeof useVehicleModels>;
  options: readonly string[];
  makeName: string | null;
  year: number | null;
  makeOther: boolean;
  modelOther: boolean;
  value: string;
  onSelect: (value: string | null, typedText: string) => void;
  onType: () => void;
  onChange: (value: string) => void;
  onFreeTextChange: (value: string) => void;
  autoFocusOther: boolean;
  error?: string;
};

/**
 * The model picker. It lists the models NHTSA knows for the chosen make and
 * year, and falls back to free text whenever that list is unavailable.
 */
function ModelField({
  state,
  options,
  makeName,
  year,
  makeOther,
  modelOther,
  value,
  onSelect,
  onType,
  onChange,
  onFreeTextChange,
  autoFocusOther,
  error,
}: ModelFieldProps) {
  const errorId = error ? "vehicle-model-error" : undefined;
  const hasList = state.status === "ready" && options.length > 0;
  const freeText =
    makeOther ||
    state.status === "error" ||
    (state.status === "ready" && !hasList);

  let note: string | undefined;

  if (state.status === "error") {
    note = "Couldn't load models from NHTSA. Type the model instead.";
  } else if (state.status === "ready" && !hasList) {
    note = `NHTSA lists no ${makeName} models for ${year}. Type the model instead.`;
  }

  let placeholder = "Search models";

  if (!makeName) {
    placeholder = "Choose a make first";
  } else if (!year) {
    placeholder = "Enter the year first";
  } else if (state.status === "loading") {
    placeholder = "Loading models...";
  }

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={freeText ? "vehicle-model-other" : "vehicle-model"}>
        Model
        {state.status === "loading" && (
          <SpinnerIcon
            className="size-3 animate-spin text-muted-foreground"
            aria-hidden
          />
        )}
      </FieldLabel>
      {freeText ? (
        <Input
          id="vehicle-model-other"
          name="model"
          value={value}
          onChange={(event) => onFreeTextChange(event.target.value)}
          autoComplete="off"
          maxLength={MAX_TEXT_LENGTH}
          placeholder="e.g. Civic"
          aria-required
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
        />
      ) : (
        <>
          <OptionCombobox
            id="vehicle-model"
            options={options}
            value={modelOther ? OTHER_OPTION : value || null}
            onSelect={onSelect}
            onType={onType}
            otherLabel={OTHER_LABEL}
            placeholder={placeholder}
            disabled={!hasList}
            invalid={!!error && !modelOther}
            describedBy={!modelOther ? errorId : undefined}
          />
          {modelOther ? (
            <OtherTextInput
              field="model"
              label="Model name"
              placeholder="Enter the model"
              value={value}
              onChange={onChange}
              autoFocus={autoFocusOther}
              error={error}
            />
          ) : (
            <input
              type="hidden"
              name="model"
              value={hasList && options.includes(value) ? value : ""}
            />
          )}
        </>
      )}
      {state.status === "error" ? (
        <div className="flex items-center justify-between gap-2">
          {error ? (
            <FieldError id="vehicle-model-error">{error}</FieldError>
          ) : (
            <FieldDescription>{note}</FieldDescription>
          )}
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="text-foreground"
            onClick={state.retry}
          >
            <ArrowClockwiseIcon data-icon="inline-start" />
            Retry
          </Button>
        </div>
      ) : error ? (
        <FieldError id="vehicle-model-error">{error}</FieldError>
      ) : (
        note && <FieldDescription>{note}</FieldDescription>
      )}
    </Field>
  );
}

function OtherTextInput({
  field,
  label,
  placeholder,
  value,
  onChange,
  autoFocus,
  error,
}: {
  field: "make" | "model";
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus: boolean;
  error?: string;
}) {
  return (
    <Input
      id={`vehicle-${field}-other`}
      name={field}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      autoFocus={autoFocus}
      autoComplete="off"
      maxLength={MAX_TEXT_LENGTH}
      placeholder={placeholder}
      aria-label={label}
      aria-required
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `vehicle-${field}-error` : undefined}
    />
  );
}

type DecodeStatus =
  | { status: "idle" }
  | { status: "decoding" }
  | { status: "error"; message: string }
  | { status: "decoded"; summary: string };

/**
 * The vehicle's VIN. It is optional and saved as entered, and decoding it
 * fills in the rest of step 1.
 */
function VinField({
  value,
  onChange,
  error,
  onDecoded,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  onDecoded: (decoded: DecodedVin) => Promise<string>;
}) {
  const [decode, setDecode] = useState<DecodeStatus>({ status: "idle" });

  async function handleDecode() {
    const normalized = value.trim().toUpperCase();

    if (!normalized) {
      setDecode({ status: "error", message: "Enter a VIN to decode" });
      return;
    }

    const invalidVin = vinError(normalized);

    if (invalidVin) {
      setDecode({ status: "error", message: invalidVin });
      return;
    }

    setDecode({ status: "decoding" });

    try {
      const summary = await onDecoded(await decodeVin(normalized));
      setDecode({ status: "decoded", summary });
    } catch (decodeError) {
      setDecode({
        status: "error",
        message:
          decodeError instanceof Error
            ? decodeError.message
            : "Something went wrong. Please try again.",
      });
    }
  }

  const decoding = decode.status === "decoding";
  const errorMessage = decode.status === "error" ? decode.message : error;

  return (
    <Field
      data-invalid={errorMessage ? true : undefined}
      className="border border-dashed p-3"
    >
      <FieldLabel htmlFor="vehicle-vin">
        VIN
        <span className="font-normal text-muted-foreground">(optional)</span>
      </FieldLabel>
      <FieldDescription id="vehicle-vin-description">
        Saved with the vehicle. Decode it to fill in the year, make, model and
        trim for you.
      </FieldDescription>
      <div className="flex gap-2">
        <Input
          id="vehicle-vin"
          name="vin"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setDecode({ status: "idle" });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleDecode();
            }
          }}
          autoComplete="off"
          spellCheck={false}
          maxLength={VIN_LENGTH}
          placeholder={`${VIN_LENGTH} characters, e.g. 1HGCM82633A004352`}
          className="uppercase placeholder:normal-case"
          aria-invalid={errorMessage ? true : undefined}
          aria-describedby="vehicle-vin-description vehicle-vin-status"
        />
        <Button
          type="button"
          variant="outline"
          className="text-foreground"
          onClick={() => void handleDecode()}
          disabled={decoding}
        >
          {decoding && (
            <SpinnerIcon
              data-icon="inline-start"
              className="animate-spin"
            />
          )}
          Decode
        </Button>
      </div>
      <div
        id="vehicle-vin-status"
        aria-live="polite"
      >
        {errorMessage && <FieldError>{errorMessage}</FieldError>}
        {decode.status === "decoded" && (
          <p className="flex items-start gap-1.5 text-xs/relaxed text-muted-foreground">
            <CheckCircleIcon className="mt-0.5 size-3.5 shrink-0 text-foreground" />
            <span>
              Filled in{" "}
              <span className="font-medium text-foreground">
                {decode.summary}
              </span>
              . Check the details below and edit anything that is off.
            </span>
          </p>
        )}
      </div>
    </Field>
  );
}

type VehicleTextFieldProps = Omit<
  React.ComponentProps<typeof Input>,
  "name" | "id"
> & {
  name: VehicleField;
  label: string;
  description?: string;
  error?: string;
};

function VehicleTextField({
  name,
  label,
  description,
  error,
  required,
  ...inputProps
}: VehicleTextFieldProps) {
  const id = `vehicle-${name}`;
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  const describedBy = error ? errorId : description ? descriptionId : undefined;

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {label}
        {!required && (
          <span className="font-normal text-muted-foreground">(optional)</span>
        )}
      </FieldLabel>
      <Input
        id={id}
        name={name}
        autoComplete="off"
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {error ? (
        <FieldError id={errorId}>{error}</FieldError>
      ) : (
        description && (
          <FieldDescription id={descriptionId}>{description}</FieldDescription>
        )
      )}
    </Field>
  );
}
