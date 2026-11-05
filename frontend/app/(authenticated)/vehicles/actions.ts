"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  readVehicleFormValues,
  validateVehicleForm,
  vehicleApiErrors,
  type VehicleFieldErrors,
  type VehicleFormValues,
} from "@/lib/vehicle-schema";
import {
  createVehicle,
  deleteVehicle,
  updateVehicle,
  type MutationResult,
  type Vehicle,
} from "@/lib/vehicles";

export type VehicleFormState = {
  values: VehicleFormValues;
  errors?: VehicleFieldErrors;
  message?: string;
  /** Set once the vehicle has been saved. */
  saved?: boolean;
};

/** Turns a failed API call into field errors or a message for the form. */
function failureState(
  values: VehicleFormValues,
  result: Extract<MutationResult<Vehicle>, { ok: false }>,
): VehicleFormState {
  return {
    values,
    ...(result.status === 400
      ? vehicleApiErrors(result.error)
      : { message: result.error }),
  };
}

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
    return failureState(values, result);
  }

  revalidatePath("/(authenticated)/vehicles", "layout");
  redirect("/vehicles?status=created");
}

/**
 * Saves every field of one of the visitor's vehicles. A vehicle that does not
 * exist or belongs to someone else shows the not-found page.
 */
export async function updateVehicleAction(
  id: number,
  _previousState: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  const values = readVehicleFormValues(formData);
  const validation = validateVehicleForm(values);

  if (!validation.success) {
    return { values, errors: validation.errors };
  }

  const result = await updateVehicle(id, validation.data);

  if (!result.ok) {
    return failureState(values, result);
  }

  revalidatePath("/(authenticated)/vehicles", "layout");

  return { values, saved: true };
}

export type DeleteVehicleState = { message?: string };

export async function deleteVehicleAction(
  id: number,
): Promise<DeleteVehicleState> {
  const result = await deleteVehicle(id);

  if (!result.ok) {
    return { message: result.error };
  }

  revalidatePath("/(authenticated)/vehicles", "layout");
  redirect("/vehicles?status=deleted");
}
