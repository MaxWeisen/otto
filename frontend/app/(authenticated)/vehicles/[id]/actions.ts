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
import type { MutationResult } from "@/lib/vehicles";

export type MaintenanceFormState = {
  values: MaintenanceFormValues;
  errors?: MaintenanceFieldErrors;
  message?: string;
  saved?: boolean;
};

export type DeleteMaintenanceResult =
  { ok: true } | { ok: false; error: string };

const RECORD_GONE = "This maintenance record no longer exists.";

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
    // A missing record, or vehicle, disappears from the page on refresh.
    if (result.status === 404) {
      revalidatePath("/(authenticated)/vehicles", "layout");
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

  if (!result.ok && result.status !== 404) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/(authenticated)/vehicles", "layout");

  return result.ok ? { ok: true } : { ok: false, error: RECORD_GONE };
}
