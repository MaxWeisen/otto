import { z } from "zod";
import { MIN_VEHICLE_YEAR, mileageSchema } from "@/lib/vehicle-schema";

// These rules mirror the backend's validation in
// backend/internal/maintenance/handler.go and backend/internal/money, and
// the maintenance_records table schema.
export const MAINTENANCE_TYPES = [
  "oil_change",
  "tire_rotation",
  "brakes",
  "inspection",
  "repair",
  "other",
] as const;

export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  oil_change: "Oil change",
  tire_rotation: "Tire rotation",
  brakes: "Brakes",
  inspection: "Inspection",
  repair: "Repair",
  other: "Other",
};

export const MAX_DESCRIPTION_LENGTH = 255;
export const MAX_NOTES_LENGTH = 10000;
export const MIN_PERFORMED_AT = `${MIN_VEHICLE_YEAR}-01-01`;
const MAX_COST_WHOLE_DIGITS = 8;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COST_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

export const MAINTENANCE_FIELDS = [
  "type",
  "performed_at",
  "description",
  "mileage",
  "cost",
  "notes",
] as const;

export type MaintenanceField = (typeof MAINTENANCE_FIELDS)[number];

export type MaintenanceFormValues = Record<MaintenanceField, string>;

export type MaintenanceFieldErrors = Partial<
  Record<MaintenanceField, string[]>
>;

const MAINTENANCE_FIELD_LABELS: Record<MaintenanceField, string> = {
  type: "Type",
  performed_at: "Date",
  description: "Description",
  mileage: "Mileage",
  cost: "Cost",
  notes: "Notes",
};

// In the visitor's time zone, not UTC.
export function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function text(label: string, maxLength: number) {
  return z
    .string()
    .trim()
    .refine((value) => !value.includes("\0"), {
      error: `${label} must not contain null characters`,
    })
    .refine((value) => [...value].length <= maxLength, {
      error: `${label} must be at most ${maxLength.toLocaleString("en-US")} characters`,
    });
}

const type = z
  .string()
  .refine((value) => value !== "", { error: "Type is required", abort: true })
  .refine(
    (value): value is MaintenanceType =>
      (MAINTENANCE_TYPES as readonly string[]).includes(value),
    { error: "Choose a type from the list" },
  )
  .transform((value) => value as MaintenanceType);

// Dates compare as YYYY-MM-DD strings. The visitor's today is never later
// than the backend's limit, which accepts any date that has started
// somewhere on Earth.
const performedAt = z
  .string()
  .trim()
  .refine((value) => value !== "", { error: "Date is required", abort: true })
  .refine((value) => DATE_PATTERN.test(value) && isCalendarDate(value), {
    error: "Date must be a valid date",
    abort: true,
  })
  .refine((value) => value >= MIN_PERFORMED_AT, {
    error: `Date must not be before ${MIN_VEHICLE_YEAR}`,
    abort: true,
  })
  .refine((value) => value <= today(), {
    error: "Date must not be in the future",
  });

const cost = z
  .string()
  .transform((value) => value.replace(/[\s,$]/g, ""))
  .superRefine((value, ctx) => {
    if (value === "") {
      return;
    }

    const match = COST_PATTERN.exec(value);

    if (value.startsWith("-")) {
      ctx.addIssue({ code: "custom", message: "Cost must not be negative" });
    } else if (!match) {
      ctx.addIssue({
        code: "custom",
        message: "Cost must be an amount like 49.99",
      });
    } else if (match[1].replace(/^0+/, "").length > MAX_COST_WHOLE_DIGITS) {
      ctx.addIssue({ code: "custom", message: "Cost is too large" });
    }
  })
  .transform((value) => value || null);

export const maintenanceFormSchema = z.object({
  type,
  performed_at: performedAt,
  description: text("Description", MAX_DESCRIPTION_LENGTH).refine(
    (value) => value !== "",
    { error: "Description is required", abort: true },
  ),
  mileage: mileageSchema,
  cost,
  notes: text("Notes", MAX_NOTES_LENGTH).transform((value) => value || null),
});

// Cost stays a decimal string so money never passes through a float.
export type MaintenanceInput = z.output<typeof maintenanceFormSchema>;

export function validateMaintenanceForm(values: MaintenanceFormValues) {
  const result = maintenanceFormSchema.safeParse(values);

  if (result.success) {
    return { success: true as const, data: result.data };
  }

  return {
    success: false as const,
    errors: z.flattenError(result.error).fieldErrors as MaintenanceFieldErrors,
  };
}

// The backend names the field first, as in "cost must not be negative".
export function maintenanceApiErrors(
  message: string,
): { errors: MaintenanceFieldErrors } | { message: string } {
  const [, name, rest] = /^(\S+)\s+(.+)$/.exec(message) ?? [];
  const field = MAINTENANCE_FIELDS.find(
    (field) => field === name?.toLowerCase(),
  );

  if (!field) {
    return { message };
  }

  return {
    errors: { [field]: [`${MAINTENANCE_FIELD_LABELS[field]} ${rest}`] },
  };
}

export function readMaintenanceFormValues(
  formData: FormData,
): MaintenanceFormValues {
  return Object.fromEntries(
    MAINTENANCE_FIELDS.map((field) => {
      const value = formData.get(field);
      return [field, typeof value === "string" ? value : ""];
    }),
  ) as MaintenanceFormValues;
}
