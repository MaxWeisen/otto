import { tz } from "@date-fns/tz";
import { format, isMatch } from "date-fns";
import { z } from "zod";
import { MIN_VEHICLE_YEAR, mileageSchema } from "@/lib/vehicle-schema";

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
const DATE_FORMAT = "yyyy-MM-dd";
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

export function today(): string {
  return format(new Date(), DATE_FORMAT);
}

// The latest date that has started anywhere (UTC+14), as the backend allows.
function latestStartedDate(): string {
  return format(new Date(), DATE_FORMAT, { in: tz("+14:00") });
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

const performedAt = z
  .string()
  .trim()
  .refine((value) => value !== "", { error: "Date is required", abort: true })
  .refine((value) => DATE_PATTERN.test(value) && isMatch(value, DATE_FORMAT), {
    error: "Date must be a valid date",
    abort: true,
  })
  .refine((value) => value >= MIN_PERFORMED_AT, {
    error: `Date must not be before ${MIN_VEHICLE_YEAR}`,
    abort: true,
  })
  .refine((value) => value <= latestStartedDate(), {
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

const mileageFormatter = new Intl.NumberFormat("en-US");

export function maintenanceFormValues(
  record:
    | Pick<
        MaintenanceInput,
        "type" | "performed_at" | "description" | "mileage" | "cost" | "notes"
      >
    | undefined,
  defaultMileage: number | null,
): MaintenanceFormValues {
  const mileage = record ? record.mileage : defaultMileage;

  return {
    type: record?.type ?? "",
    performed_at: record?.performed_at ?? today(),
    description: record?.description ?? "",
    mileage: mileage === null ? "" : mileageFormatter.format(mileage),
    cost: record?.cost ?? "",
    notes: record?.notes ?? "",
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
