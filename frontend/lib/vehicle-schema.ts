import { z } from "zod";

// These rules mirror the backend's validation in
// backend/internal/vehicles/handler.go and the vehicles table schema.
export const MIN_VEHICLE_YEAR = 1886;
export const MAX_TEXT_LENGTH = 255;
export const VIN_LENGTH = 17;
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]+$/;
const MAX_MILEAGE = 2_147_483_647;

export function maxVehicleYear(): number {
  return new Date().getFullYear() + 1;
}

export const VEHICLE_FIELDS = [
  "year",
  "make",
  "model",
  "trim",
  "nickname",
  "mileage",
  "vin",
] as const;

export type VehicleField = (typeof VEHICLE_FIELDS)[number];

/** The fields collected on each step of the add-vehicle wizard, in order. */
export const VEHICLE_FORM_STEPS = [
  ["vin", "year", "make", "model", "trim"],
  ["mileage", "nickname"],
] as const satisfies readonly (readonly VehicleField[])[];

/** Raw form values, exactly as typed into the vehicle form. */
export type VehicleFormValues = Record<VehicleField, string>;

export type VehicleFieldErrors = Partial<Record<VehicleField, string[]>>;

function text(label: string) {
  return z
    .string()
    .trim()
    .refine((value) => !value.includes("\0"), {
      error: `${label} must not contain null characters`,
    })
    .refine((value) => [...value].length <= MAX_TEXT_LENGTH, {
      error: `${label} must be at most ${MAX_TEXT_LENGTH} characters`,
    });
}

function requiredText(label: string) {
  return text(label).refine((value) => value !== "", {
    error: `${label} is required`,
    abort: true,
  });
}

function optionalText(label: string) {
  return text(label).transform((value) => value || null);
}

const year = z
  .string()
  .trim()
  .refine((value) => value !== "", { error: "Year is required", abort: true })
  .refine((value) => /^\d+$/.test(value), {
    error: "Year must be a number",
    abort: true,
  })
  .transform(Number)
  .refine((value) => value >= MIN_VEHICLE_YEAR && value <= maxVehicleYear(), {
    error: () =>
      `Year must be between ${MIN_VEHICLE_YEAR} and ${maxVehicleYear()}`,
  });

const mileage = z
  .string()
  .transform((value) => value.replace(/[\s,_]/g, ""))
  .refine((value) => value === "" || /^\d+$/.test(value), {
    error: "Mileage must be a whole number of 0 or more",
    abort: true,
  })
  .transform((value) => (value === "" ? null : Number(value)))
  .refine((value) => value === null || value <= MAX_MILEAGE, {
    error: "Mileage is too large",
  });

const vin = z
  .string()
  .trim()
  .toUpperCase()
  .superRefine((value, ctx) => {
    if (value === "") {
      return;
    }

    if (value.length !== VIN_LENGTH) {
      ctx.addIssue({
        code: "custom",
        message: `VIN must be ${VIN_LENGTH} characters (currently ${value.length})`,
      });
    } else if (!VIN_PATTERN.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: "VIN can only use letters and digits, excluding I, O and Q",
      });
    }
  })
  .transform((value) => value || null);

export const vehicleFormSchema = z.object({
  year,
  make: requiredText("Make"),
  model: requiredText("Model"),
  trim: optionalText("Trim"),
  nickname: optionalText("Nickname"),
  mileage,
  vin,
});

/** The normalized vehicle payload accepted by the API. */
export type VehicleInput = z.output<typeof vehicleFormSchema>;

export function validateVehicleForm(values: VehicleFormValues) {
  const result = vehicleFormSchema.safeParse(values);

  if (result.success) {
    return { success: true as const, data: result.data };
  }

  return {
    success: false as const,
    errors: z.flattenError(result.error).fieldErrors as VehicleFieldErrors,
  };
}

/** Validates only the given fields, e.g. the ones on one wizard step. */
export function validateVehicleFields(
  values: VehicleFormValues,
  fields: readonly VehicleField[],
): VehicleFieldErrors | null {
  const mask = Object.fromEntries(
    fields.map((field) => [field, true]),
  ) as Partial<Record<VehicleField, true>>;
  const result = vehicleFormSchema.pick(mask).safeParse(values);

  if (result.success) {
    return null;
  }

  return z.flattenError(result.error).fieldErrors as VehicleFieldErrors;
}

/** Returns why vin is not a valid VIN, or undefined when it is. */
export function vinError(vin: string): string | undefined {
  const result = vehicleFormSchema.shape.vin.safeParse(vin);

  return result.success ? undefined : result.error.issues[0]?.message;
}

export function readVehicleFormValues(formData: FormData): VehicleFormValues {
  return Object.fromEntries(
    VEHICLE_FIELDS.map((field) => {
      const value = formData.get(field);
      return [field, typeof value === "string" ? value : ""];
    }),
  ) as VehicleFormValues;
}
