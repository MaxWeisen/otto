"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  SpinnerIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { VehicleFormState } from "@/app/(authenticated)/vehicles/actions";
import { OptionCombobox, OTHER_OPTION } from "@/components/option-combobox";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useVehicleModels } from "@/hooks/use-vehicle-models";
import { cn } from "@/lib/utils";
import { findVehicleMake, VEHICLE_MAKES } from "@/lib/vehicle-makes";
import {
  MAX_TEXT_LENGTH,
  validateVehicleFields,
  vinError,
  VIN_LENGTH,
  type VehicleField,
  type VehicleFieldErrors,
  type VehicleFormValues,
} from "@/lib/vehicle-schema";
import {
  cachedVehicleModels,
  decodeVin,
  loadVehicleModels,
  type DecodedVin,
} from "@/lib/vpic-client";

const OTHER_LABEL = "Other / not listed";

type UseVehicleFieldsOptions = {
  defaultValues: VehicleFormValues;
  /** The latest state returned by the form's server action. */
  state: VehicleFormState;
  /** The fields in the order the form shows them. */
  fieldOrder: readonly VehicleField[];
  /** Called with the first field that has an error whenever errors show. */
  onInvalidField?: (field: VehicleField) => void;
};

export type VehicleFields = ReturnType<typeof useVehicleFields>;

/**
 * The state behind a vehicle form: the values, the make and model pickers
 * with their Other fallbacks, the model list from vPIC, and the errors from
 * client-side validation and the server action.
 */
export function useVehicleFields({
  defaultValues,
  state,
  fieldOrder,
  onInvalidField,
}: UseVehicleFieldsOptions) {
  const [values, setValues] = useState(defaultValues);
  const [makeOther, setMakeOther] = useState(
    () => defaultValues.make !== "" && !findVehicleMake(defaultValues.make),
  );
  const [modelOther, setModelOther] = useState(false);
  // A prefilled model has not been checked against the model list yet. It
  // stays as Other when the list does not include it, instead of clearing.
  const [modelUnchecked, setModelUnchecked] = useState(
    defaultValues.model !== "",
  );
  const [focusOther, setFocusOther] = useState<"make" | "model" | null>(null);
  const [clientErrors, setClientErrors] = useState<VehicleFieldErrors | null>(
    null,
  );
  const [editedFields, setEditedFields] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [handledState, setHandledState] = useState(state);
  const latestValues = useRef(values);

  useEffect(() => {
    latestValues.current = values;
  }, [values]);

  const firstInvalidField = (errors: VehicleFieldErrors) =>
    fieldOrder.find((field) => errors[field]);

  // A new server response replaces any client-side errors.
  if (state !== handledState) {
    setHandledState(state);
    setClientErrors(null);
    setEditedFields(new Set());

    const invalid = state.errors && firstInvalidField(state.errors);

    if (invalid) {
      onInvalidField?.(invalid);
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
    if (modelUnchecked) {
      setModelOther(true);
    } else {
      setValues({ ...values, model: "" });
    }
  }

  if (modelUnchecked && modelsState.status === "ready") {
    setModelUnchecked(false);
  }

  const errors = clientErrors ?? state.errors ?? {};
  const errorFor = (field: VehicleField) =>
    editedFields.has(field) ? undefined : errors[field]?.[0];

  function markEdited(...fields: VehicleField[]) {
    setEditedFields((current) => new Set([...current, ...fields]));

    if (fields.some((field) => ["year", "make", "model"].includes(field))) {
      setModelUnchecked(false);
    }
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

  function setFreeTextModel(value: string) {
    setModelOther(value !== "");
    setField("model", value);
  }

  /**
   * Fills the form from a decoded VIN and returns a summary of what changed,
   * or null when the decode is no longer current. Fields edited while the
   * decode was in flight keep the visitor's value.
   */
  async function applyDecodedVin(
    decoded: DecodedVin,
    isCurrent: () => boolean,
  ): Promise<string | null> {
    const listed = decoded.make ? findVehicleMake(decoded.make) : undefined;
    const makeName = listed ?? decoded.make;
    const modelYear = decoded.year ?? lookupYear;
    let loadedModels: readonly string[] | undefined;

    if (listed && modelYear && decoded.model) {
      try {
        loadedModels = await loadVehicleModels(listed, modelYear);
      } catch {
        // The decoded model stays as free text when the list cannot load.
      }
    }

    if (!isCurrent()) {
      return null;
    }

    const current = latestValues.current;
    const unchanged = (field: VehicleField) => current[field] === values[field];
    const updates: Partial<VehicleFormValues> = { vin: decoded.vin };

    if (decoded.year && unchanged("year")) {
      updates.year = String(decoded.year);
    }

    // The model only counts as listed when it is in the list for the year
    // that ends up in the form.
    const formYear = updates.year ?? current.year;
    const finalYear = validateVehicleFields({ ...current, year: formYear }, [
      "year",
    ])
      ? null
      : Number(formYear);
    const yearModels =
      finalYear === modelYear
        ? loadedModels
        : listed && finalYear
          ? cachedVehicleModels(listed, finalYear)
          : undefined;
    const match = yearModels?.find(
      (option) => option.toLowerCase() === decoded.model?.toLowerCase(),
    );
    const model = match ?? decoded.model;
    const isModelOther = !match;

    if (makeName && unchanged("make")) {
      updates.make = makeName;
      setMakeOther(!listed);
    }

    const nextModel = model ?? (decoded.make ? "" : null);

    if (nextModel !== null && unchanged("make") && unchanged("model")) {
      updates.model = nextModel;
      setModelOther(nextModel !== "" && isModelOther);
    }

    if (decoded.trim && unchanged("make") && unchanged("trim")) {
      updates.trim = decoded.trim;
    }

    setFocusOther(null);
    setValues((latest) => ({ ...latest, ...updates }));
    markEdited(...(Object.keys(updates) as VehicleField[]));

    return [updates.year, updates.make, updates.model, updates.trim]
      .filter(Boolean)
      .join(" ");
  }

  /** Shows errors from client-side validation and focuses the first one. */
  function showErrors(fieldErrors: VehicleFieldErrors) {
    const invalid = firstInvalidField(fieldErrors);

    flushSync(() => {
      setClientErrors(fieldErrors);
      setEditedFields(new Set());

      if (invalid) {
        onInvalidField?.(invalid);
      }
    });

    if (invalid) {
      focusVehicleField(invalid);
    }
  }

  /** Drops the errors from client-side validation once the form is valid. */
  function clearErrors() {
    setClientErrors(null);
  }

  const textFieldProps = (field: VehicleField) => ({
    name: field,
    value: values[field],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setField(field, event.target.value),
    error: errorFor(field),
  });

  return {
    values,
    makeOther,
    modelOther,
    focusOther,
    listedMake,
    lookupYear,
    modelsState,
    modelOptions,
    errorFor,
    firstInvalidField,
    markEdited,
    setField,
    selectMake,
    selectModel,
    setFreeTextModel,
    applyDecodedVin,
    showErrors,
    clearErrors,
    textFieldProps,
  };
}

/** Focuses a vehicle field's input, preferring its free-text Other input. */
export function focusVehicleField(field: VehicleField) {
  const input =
    document.getElementById(`vehicle-${field}-other`) ??
    document.getElementById(`vehicle-${field}`);

  input?.focus();
}

/** The make picker: the curated list of makes, with Other for the rest. */
export function MakeField({ fields }: { fields: VehicleFields }) {
  const { makeOther, listedMake, values, focusOther } = fields;
  const error = fields.errorFor("make");

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor="vehicle-make">Make</FieldLabel>
      <OptionCombobox
        id="vehicle-make"
        options={VEHICLE_MAKES}
        value={makeOther ? OTHER_OPTION : listedMake}
        onSelect={fields.selectMake}
        onType={() => fields.markEdited("make")}
        otherLabel={OTHER_LABEL}
        placeholder="Search makes"
        invalid={!!error && !makeOther}
        describedBy={error && !makeOther ? "vehicle-make-error" : undefined}
      />
      {makeOther ? (
        <OtherTextInput
          field="make"
          label="Make name"
          placeholder="Enter the make"
          value={values.make}
          onChange={(value) => fields.setField("make", value)}
          autoFocus={focusOther === "make"}
          error={error}
        />
      ) : (
        <input
          type="hidden"
          name="make"
          value={listedMake ?? ""}
        />
      )}
      {error && <FieldError id="vehicle-make-error">{error}</FieldError>}
    </Field>
  );
}

/**
 * The model picker. It lists the models NHTSA knows for the chosen make and
 * year, and falls back to free text whenever that list is unavailable.
 */
export function ModelField({ fields }: { fields: VehicleFields }) {
  const {
    modelsState: state,
    modelOptions: options,
    listedMake: makeName,
    lookupYear: year,
    makeOther,
    modelOther,
    values: { model: value },
  } = fields;
  const error = fields.errorFor("model");
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
          onChange={(event) => fields.setFreeTextModel(event.target.value)}
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
            onSelect={fields.selectModel}
            onType={() => fields.markEdited("model")}
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
              onChange={(next) => fields.setField("model", next)}
              autoFocus={fields.focusOther === "model"}
              error={error}
            />
          ) : (
            <input
              type="hidden"
              name="model"
              value={
                state.status === "ready" && !options.includes(value)
                  ? ""
                  : value
              }
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

type VinInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "id" | "name" | "value" | "onChange"
> & {
  value: string;
  /** Called with the VIN without spaces, uppercased and cut to length. */
  onChange: (value: string) => void;
};

/** A VIN input that strips spaces and uppercases as the visitor types. */
function VinInput({
  value,
  onChange,
  className,
  ...inputProps
}: VinInputProps) {
  function change(next: string) {
    onChange(next.replace(/\s/g, "").toUpperCase().slice(0, VIN_LENGTH));
  }

  return (
    <Input
      id="vehicle-vin"
      name="vin"
      value={value}
      onChange={(event) => change(event.target.value)}
      onPaste={(event) => {
        const input = event.currentTarget;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;

        event.preventDefault();
        change(
          input.value.slice(0, start) +
            event.clipboardData.getData("text") +
            input.value.slice(end),
        );
      }}
      autoComplete="off"
      spellCheck={false}
      maxLength={VIN_LENGTH}
      placeholder={`${VIN_LENGTH} characters, e.g. 1HGCM82633A004352`}
      className={cn("uppercase placeholder:normal-case", className)}
      {...inputProps}
    />
  );
}

/** The vehicle's VIN, saved as entered. */
export function VinTextField({ fields }: { fields: VehicleFields }) {
  const error = fields.errorFor("vin");

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor="vehicle-vin">
        VIN
        <span className="font-normal text-muted-foreground">(optional)</span>
      </FieldLabel>
      <VinInput
        value={fields.values.vin}
        onChange={(value) => fields.setField("vin", value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "vehicle-vin-error" : undefined}
      />
      {error && <FieldError id="vehicle-vin-error">{error}</FieldError>}
    </Field>
  );
}

type DecodeStatus =
  | { status: "idle" }
  | { status: "decoding" }
  | { status: "error"; message: string }
  | { status: "decoded"; summary: string };

/**
 * The vehicle's VIN. It is optional and saved as entered, and decoding it
 * fills in the year, make, model and trim.
 */
export function VinDecodeField({ fields }: { fields: VehicleFields }) {
  const [decode, setDecode] = useState<DecodeStatus>({ status: "idle" });
  const decodeRequest = useRef(0);
  const value = fields.values.vin;
  const error = fields.errorFor("vin");

  async function handleDecode() {
    const request = ++decodeRequest.current;
    const isCurrent = () => decodeRequest.current === request;
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
      const summary = await fields.applyDecodedVin(
        await decodeVin(normalized),
        isCurrent,
      );

      if (summary !== null && isCurrent()) {
        setDecode({ status: "decoded", summary });
      }
    } catch (decodeError) {
      if (!isCurrent()) {
        return;
      }

      setDecode({
        status: "error",
        message:
          decodeError instanceof Error
            ? decodeError.message
            : "Something went wrong. Please try again.",
      });
    }
  }

  function changeVin(next: string) {
    decodeRequest.current += 1;
    fields.setField("vin", next);
    setDecode({ status: "idle" });
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
        <VinInput
          value={value}
          onChange={changeVin}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleDecode();
            }
          }}
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
            {decode.summary ? (
              <span>
                Filled in{" "}
                <span className="font-medium text-foreground">
                  {decode.summary}
                </span>
                . Check the details below and edit anything that is off.
              </span>
            ) : (
              <span>Decoded. No details were filled in from this VIN.</span>
            )}
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

export function VehicleTextField({
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

/** A form-level error, such as a backend failure, shown above the actions. */
export function FormAlert({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive",
        className,
      )}
    >
      <WarningCircleIcon className="mt-px size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
