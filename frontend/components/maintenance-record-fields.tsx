"use client";

import { useState } from "react";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  MAINTENANCE_TYPE_LABELS,
  MAINTENANCE_TYPES,
  MAX_DESCRIPTION_LENGTH,
  MAX_NOTES_LENGTH,
  MAINTENANCE_FIELDS,
  MIN_PERFORMED_AT,
  today,
  type MaintenanceField,
  type MaintenanceFieldErrors,
  type MaintenanceFormValues,
} from "@/lib/maintenance-schema";

const fieldId = (field: MaintenanceField) => `maintenance-${field}`;

export function firstInvalidInput(errors: MaintenanceFieldErrors | undefined) {
  const invalid = MAINTENANCE_FIELDS.find((field) => errors?.[field]);

  return invalid ? document.getElementById(fieldId(invalid)) : null;
}

export function MaintenanceRecordFields({
  values,
  errors: allErrors,
}: {
  values: MaintenanceFormValues;
  errors: MaintenanceFieldErrors | undefined;
}) {
  const [type, setType] = useState(values.type);
  // A field's error clears once it is edited, until the next errors arrive.
  const [edited, setEdited] = useState<ReadonlySet<MaintenanceField>>(
    new Set(),
  );
  const [shownErrors, setShownErrors] = useState(allErrors);

  if (allErrors !== shownErrors) {
    setShownErrors(allErrors);
    setEdited(new Set());
  }

  const errors = Object.fromEntries(
    MAINTENANCE_FIELDS.map((field) => [
      field,
      edited.has(field) ? undefined : allErrors?.[field]?.[0],
    ]),
  ) as Partial<Record<MaintenanceField, string>>;
  const onChange = (field: MaintenanceField) => {
    if (!edited.has(field)) {
      setEdited(new Set([...edited, field]));
    }
  };

  const describedBy = (field: MaintenanceField) =>
    errors[field] ? `${fieldId(field)}-error` : undefined;
  const inputProps = (field: MaintenanceField) => ({
    id: fieldId(field),
    name: field,
    defaultValue: values[field],
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": describedBy(field),
    onChange: () => onChange(field),
  });
  const field = (name: MaintenanceField, label: string, required = false) => ({
    label,
    required,
    id: fieldId(name),
    error: errors[name],
  });

  return (
    <FieldGroup className="gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField {...field("type", "Type", true)}>
          <Select
            name="type"
            value={type || null}
            onValueChange={(value) => {
              setType(value ?? "");
              onChange("type");
            }}
            items={MAINTENANCE_TYPE_LABELS}
          >
            <SelectTrigger
              id={fieldId("type")}
              className="w-full"
              aria-invalid={errors.type ? true : undefined}
              aria-describedby={describedBy("type")}
            >
              <SelectValue placeholder="Choose a type" />
            </SelectTrigger>
            <SelectContent>
              {MAINTENANCE_TYPES.map((value) => (
                <SelectItem
                  key={value}
                  value={value}
                >
                  {MAINTENANCE_TYPE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField {...field("performed_at", "Date", true)}>
          <Input
            type="date"
            min={MIN_PERFORMED_AT}
            max={today()}
            aria-required
            {...inputProps("performed_at")}
          />
        </FormField>
      </div>
      <FormField {...field("description", "Description", true)}>
        <Input
          autoComplete="off"
          maxLength={MAX_DESCRIPTION_LENGTH}
          placeholder="e.g. Synthetic 5W-30 and filter"
          aria-required
          {...inputProps("description")}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField {...field("mileage", "Mileage")}>
          <Input
            autoComplete="off"
            inputMode="numeric"
            placeholder="e.g. 84,500"
            {...inputProps("mileage")}
          />
        </FormField>
        <FormField {...field("cost", "Cost")}>
          <Input
            autoComplete="off"
            inputMode="decimal"
            placeholder="e.g. 49.99"
            {...inputProps("cost")}
          />
        </FormField>
      </div>
      <FormField {...field("notes", "Notes")}>
        <Textarea
          maxLength={MAX_NOTES_LENGTH}
          placeholder="Parts, shop, anything worth remembering"
          className="max-h-48"
          {...inputProps("notes")}
        />
      </FormField>
    </FieldGroup>
  );
}

function FormField({
  id,
  label,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  error: string | undefined;
  required: boolean;
  children: React.ReactNode;
}) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {label}
        {!required && (
          <span className="font-normal text-muted-foreground">(optional)</span>
        )}
      </FieldLabel>
      {children}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  );
}
