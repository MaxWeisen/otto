"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/auth";
import {
  readVehicleFormValues,
  validateVehicleForm,
  type VehicleFieldErrors,
  type VehicleFormValues,
} from "@/lib/vehicle-schema";
import { createVehicle } from "@/lib/vehicles";

export type VehicleFormState = {
  values: VehicleFormValues;
  errors?: VehicleFieldErrors;
  message?: string;
};

export async function createVehicleAction(
  _previousState: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  const values = readVehicleFormValues(formData);
  const validation = validateVehicleForm(values);

  if (!validation.success) {
    return { values, errors: validation.errors };
  }

  const result = await createVehicle(validation.data);

  if (!result.ok) {
    if (result.status === 401) {
      redirectToLogin();
    }

    return { values, message: result.error };
  }

  revalidatePath("/vehicles");
  redirect("/vehicles?status=created");
}
