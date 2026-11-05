"use client";

import { useLayoutEffect, useState } from "react";
import { SpinnerIcon } from "@phosphor-icons/react";
import type { MaintenanceFormState } from "@/app/(authenticated)/vehicles/[id]/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { FormAlert } from "@/components/vehicle-fields";
import {
  MAINTENANCE_FIELDS,
  MAINTENANCE_TYPE_LABELS,
  MAINTENANCE_TYPES,
  MAX_DESCRIPTION_LENGTH,
  MAX_NOTES_LENGTH,
  MIN_PERFORMED_AT,
  readMaintenanceFormValues,
  today,
  validateMaintenanceForm,
  type MaintenanceField,
  type MaintenanceFieldErrors,
} from "@/lib/maintenance-schema";

type MaintenanceRecordDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  /** The values to start from, with any errors from an earlier attempt. */
  state: MaintenanceFormState;
  action: (formData: FormData) => void;
  pending?: boolean;
  /** Called when the form passes validation, just before it submits. */
  onValidSubmit?: () => void;
};

const fieldId = (field: MaintenanceField) => `maintenance-${field}`;

function firstInvalidField(errors: MaintenanceFieldErrors | undefined) {
  return MAINTENANCE_FIELDS.find((field) => errors?.[field]);
}

function focusField(field: MaintenanceField) {
  document.getElementById(fieldId(field))?.focus();
}

export function MaintenanceRecordDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  state,
  action,
  pending = false,
  onValidSubmit,
}: MaintenanceRecordDialogProps) {
  // The inputs are uncontrolled, so each new action state remounts the form
  // to show its values and errors.
  const [formState, setFormState] = useState(state);
  const [formKey, setFormKey] = useState(0);

  if (state !== formState) {
    setFormState(state);
    setFormKey(formKey + 1);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
        initialFocus={() => {
          const invalid = firstInvalidField(state.errors);

          return invalid ? document.getElementById(fieldId(invalid)) : true;
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <MaintenanceRecordForm
          key={formKey}
          label={title}
          state={state}
          action={action}
          pending={pending}
          submitLabel={submitLabel}
          onCancel={() => onOpenChange(false)}
          onValidSubmit={onValidSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

type MaintenanceRecordFormProps = {
  label: string;
  state: MaintenanceFormState;
  action: (formData: FormData) => void;
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
  onValidSubmit?: () => void;
};

function MaintenanceRecordForm({
  label,
  state,
  action,
  pending,
  submitLabel,
  onCancel,
  onValidSubmit,
}: MaintenanceRecordFormProps) {
  const [type, setType] = useState(state.values.type);
  const [clientErrors, setClientErrors] =
    useState<MaintenanceFieldErrors | null>(null);
  const [editedFields, setEditedFields] = useState<
    ReadonlySet<MaintenanceField>
  >(new Set());

  useLayoutEffect(() => {
    const invalid = firstInvalidField(state.errors);

    if (invalid) {
      focusField(invalid);
    }
  }, [state]);

  const errors = clientErrors ?? state.errors ?? {};
  const errorFor = (field: MaintenanceField) =>
    editedFields.has(field) ? undefined : errors[field]?.[0];

  function markEdited(field: MaintenanceField) {
    if (!editedFields.has(field)) {
      setEditedFields(new Set([...editedFields, field]));
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const validation = validateMaintenanceForm(
      readMaintenanceFormValues(new FormData(event.currentTarget)),
    );

    if (!validation.success) {
      event.preventDefault();
      setClientErrors(validation.errors);
      setEditedFields(new Set());

      const invalid = firstInvalidField(validation.errors);

      if (invalid) {
        focusField(invalid);
      }

      return;
    }

    setClientErrors(null);
    onValidSubmit?.();
  }

  const fieldProps = (field: MaintenanceField) => {
    const error = errorFor(field);

    return {
      id: fieldId(field),
      name: field,
      defaultValue: state.values[field],
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `${fieldId(field)}-error` : undefined,
      onChange: () => markEdited(field),
    };
  };

  return (
    <form
      action={action}
      onSubmit={handleSubmit}
      aria-label={label}
      noValidate
      className="flex flex-col gap-4"
    >
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            field="type"
            label="Type"
            error={errorFor("type")}
            required
          >
            <Select
              name="type"
              value={type || null}
              onValueChange={(value) => {
                setType(value ?? "");
                markEdited("type");
              }}
              items={MAINTENANCE_TYPE_LABELS}
            >
              <SelectTrigger
                id={fieldId("type")}
                className="w-full"
                aria-invalid={errorFor("type") ? true : undefined}
                aria-describedby={
                  errorFor("type") ? `${fieldId("type")}-error` : undefined
                }
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
          <FormField
            field="performed_at"
            label="Date"
            error={errorFor("performed_at")}
            required
          >
            <Input
              type="date"
              min={MIN_PERFORMED_AT}
              max={today()}
              aria-required
              {...fieldProps("performed_at")}
            />
          </FormField>
        </div>
        <FormField
          field="description"
          label="Description"
          error={errorFor("description")}
          required
        >
          <Input
            autoComplete="off"
            maxLength={MAX_DESCRIPTION_LENGTH}
            placeholder="e.g. Synthetic 5W-30 and filter"
            aria-required
            {...fieldProps("description")}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            field="mileage"
            label="Mileage"
            error={errorFor("mileage")}
          >
            <Input
              autoComplete="off"
              inputMode="numeric"
              placeholder="e.g. 84,500"
              {...fieldProps("mileage")}
            />
          </FormField>
          <FormField
            field="cost"
            label="Cost"
            error={errorFor("cost")}
          >
            <Input
              autoComplete="off"
              inputMode="decimal"
              placeholder="e.g. 49.99"
              {...fieldProps("cost")}
            />
          </FormField>
        </div>
        <FormField
          field="notes"
          label="Notes"
          error={errorFor("notes")}
        >
          <Textarea
            maxLength={MAX_NOTES_LENGTH}
            placeholder="Parts, shop, anything worth remembering"
            className="max-h-48"
            {...fieldProps("notes")}
          />
        </FormField>
        {state.message && <FormAlert message={state.message} />}
      </FieldGroup>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
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
          {pending ? "Saving..." : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormField({
  field,
  label,
  error,
  required,
  children,
}: {
  field: MaintenanceField;
  label: string;
  error: string | undefined;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={fieldId(field)}>
        {label}
        {!required && (
          <span className="font-normal text-muted-foreground">(optional)</span>
        )}
      </FieldLabel>
      {children}
      {error && <FieldError id={`${fieldId(field)}-error`}>{error}</FieldError>}
    </Field>
  );
}
