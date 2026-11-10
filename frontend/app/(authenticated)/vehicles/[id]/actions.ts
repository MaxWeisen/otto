"use server";

import { revalidatePath } from "next/cache";
import {
  deleteMaintenanceRecord,
  saveMaintenanceRecord,
  type MaintenanceInput,
} from "@/lib/maintenance";
import { getVehicle } from "@/lib/vehicles";

export type MaintenanceFormState = {
  values?: Record<string, string>;
  errors?: Record<string, string>;
  message?: string;
  saved?: boolean;
};

export type DeleteMaintenanceResult =
  { ok: true } | { ok: false; error: string };

const RECORD_GONE = "This maintenance record no longer exists.";

function readInput(formData: FormData): MaintenanceInput {
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const mileage = text("mileage");
  const cost = text("cost").replace(/^\$/, "");

  return {
    type: text("type"),
    description: text("description"),
    performed_at: text("performed_at"),
    mileage: /^-?\d+$/.test(mileage) ? Number(mileage) : mileage || null,
    cost: cost || null,
    notes: text("notes") || null,
  };
}

// A 404 can mean the whole vehicle is gone, which shows the not-found page.
async function refreshAfterNotFound(vehicleId: number) {
  await getVehicle(String(vehicleId));
  revalidatePath("/(authenticated)/vehicles", "layout");
}

async function save(
  vehicleId: number,
  recordId: number | undefined,
  formData: FormData,
): Promise<MaintenanceFormState> {
  const values = Object.fromEntries(
    [...formData].map(([name, value]) => [name, String(value)]),
  );
  const result = await saveMaintenanceRecord(
    vehicleId,
    recordId,
    readInput(formData),
  );

  if (result.ok) {
    revalidatePath("/(authenticated)/vehicles", "layout");
    return { saved: true };
  }

  if (result.status === 404) {
    await refreshAfterNotFound(vehicleId);
    return { values, message: RECORD_GONE };
  }

  return result.errors
    ? { values, errors: result.errors }
    : { values, message: result.error };
}

export async function createMaintenanceRecordAction(
  vehicleId: number,
  _previousState: MaintenanceFormState,
  formData: FormData,
): Promise<MaintenanceFormState> {
  return save(vehicleId, undefined, formData);
}

export async function updateMaintenanceRecordAction(
  vehicleId: number,
  recordId: number,
  _previousState: MaintenanceFormState,
  formData: FormData,
): Promise<MaintenanceFormState> {
  return save(vehicleId, recordId, formData);
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
    await refreshAfterNotFound(vehicleId);
    return { ok: false, error: RECORD_GONE };
  }

  return { ok: false, error: result.error };
}
