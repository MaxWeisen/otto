"use server";

import { revalidatePath } from "next/cache";
import {
  createMaintenanceRecord,
  deleteMaintenanceRecord,
  updateMaintenanceRecord,
  type MaintenanceRecord,
} from "@/lib/maintenance";
import {
  maintenanceApiErrors,
  readMaintenanceFormValues,
  validateMaintenanceForm,
  type MaintenanceFieldErrors,
  type MaintenanceFormValues,
} from "@/lib/maintenance-schema";
import { getVehicle, type MutationResult } from "@/lib/vehicles";

export type MaintenanceFormState = {
  values: MaintenanceFormValues;
  errors?: MaintenanceFieldErrors;
  message?: string;
  saved?: boolean;
  gone?: boolean;
};

export type DeleteMaintenanceResult =
  { ok: true } | { ok: false; error: string };

const RECORD_GONE = "This maintenance record no longer exists.";

// A 404 can mean the whole vehicle is gone, which shows the not-found page.
async function refreshAfterRecordGone(vehicleId: number) {
  await getVehicle(String(vehicleId));
  revalidatePath("/(authenticated)/vehicles", "layout");
}

function failureState(
  values: MaintenanceFormValues,
  result: Extract<MutationResult<MaintenanceRecord>, { ok: false }>,
): MaintenanceFormState {
  if (result.status === 400) {
    return { values, ...maintenanceApiErrors(result.error) };
  }

  return {
    values,
    message: result.status === 404 ? RECORD_GONE : result.error,
  };
}

export async function createMaintenanceRecordAction(
  vehicleId: number,
  _previousState: MaintenanceFormState,
  formData: FormData,
): Promise<MaintenanceFormState> {
  const values = readMaintenanceFormValues(formData);
  const validation = validateMaintenanceForm(values);

  if (!validation.success) {
    return { values, errors: validation.errors };
  }

  const result = await createMaintenanceRecord(vehicleId, validation.data);

  if (!result.ok) {
    return failureState(values, result);
  }

  revalidatePath("/(authenticated)/vehicles", "layout");

  return { values, saved: true };
}

export async function updateMaintenanceRecordAction(
  vehicleId: number,
  recordId: number,
  _previousState: MaintenanceFormState,
  formData: FormData,
): Promise<MaintenanceFormState> {
  const values = readMaintenanceFormValues(formData);
  const validation = validateMaintenanceForm(values);

  if (!validation.success) {
    return { values, errors: validation.errors };
  }

  const result = await updateMaintenanceRecord(
    vehicleId,
    recordId,
    validation.data,
  );

  if (!result.ok) {
    if (result.status === 404) {
      await refreshAfterRecordGone(vehicleId);
      return { values, message: RECORD_GONE, gone: true };
    }

    return failureState(values, result);
  }

  revalidatePath("/(authenticated)/vehicles", "layout");

  return { values, saved: true };
}

export async function deleteMaintenanceRecordAction(
  vehicleId: number,
  recordId: number,
): Promise<DeleteMaintenanceResult> {
  const result = await deleteMaintenanceRecord(vehicleId, recordId);

  if (result.ok) {
    revalidatePath("/(authenticated)/vehicles", "layout");
    return { ok: true };
  }

  if (result.status === 404) {
    await refreshAfterRecordGone(vehicleId);
    return { ok: false, error: RECORD_GONE };
  }

  return { ok: false, error: result.error };
}
