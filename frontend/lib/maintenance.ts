import "server-only";
import { notFound, unstable_rethrow } from "next/navigation";
import { apiFetch, readApiError } from "@/lib/api";
import type {
  MaintenanceInput,
  MaintenanceType,
} from "@/lib/maintenance-schema";
import {
  UNREACHABLE_FAILURE,
  assertPositiveId,
  isVehicleId,
  type MutationFailure,
  type MutationResult,
} from "@/lib/vehicles";

export type MaintenanceRecord = {
  id: number;
  vehicle_id: number;
  type: MaintenanceType;
  description: string;
  performed_at: string;
  mileage: number | null;
  cost: string | null;
  notes: string | null;
  created_at: string;
};

function recordsPath(vehicleId: number, recordId?: number): string {
  assertPositiveId(vehicleId);

  if (recordId !== undefined) {
    assertPositiveId(recordId);
  }

  const base = `/api/vehicles/${vehicleId}/maintenance`;

  return recordId === undefined ? base : `${base}/${recordId}`;
}

export async function listMaintenanceRecords(
  vehicleId: string,
): Promise<MaintenanceRecord[]> {
  if (!isVehicleId(vehicleId)) {
    notFound();
  }

  const response = await apiFetch(recordsPath(Number(vehicleId)));

  if (response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}

export async function createMaintenanceRecord(
  vehicleId: number,
  input: MaintenanceInput,
): Promise<MutationResult<MaintenanceRecord>> {
  const result = await send(recordsPath(vehicleId), "POST", input);

  if (!result.ok && result.status === 404) {
    notFound();
  }

  return result;
}

export async function updateMaintenanceRecord(
  vehicleId: number,
  recordId: number,
  input: MaintenanceInput,
): Promise<MutationResult<MaintenanceRecord>> {
  return send(recordsPath(vehicleId, recordId), "PUT", input);
}

export async function deleteMaintenanceRecord(
  vehicleId: number,
  recordId: number,
): Promise<{ ok: true } | MutationFailure> {
  const response = await request(recordsPath(vehicleId, recordId), {
    method: "DELETE",
  });

  if (!(response instanceof Response)) {
    return response;
  }

  if (response.status !== 204) {
    return {
      ok: false,
      status: response.status,
      error: await readApiError(response),
    };
  }

  return { ok: true };
}

async function send(
  path: string,
  method: "POST" | "PUT",
  input: MaintenanceInput,
): Promise<MutationResult<MaintenanceRecord>> {
  const response = await request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!(response instanceof Response)) {
    return response;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: await readApiError(response),
    };
  }

  return { ok: true, data: await response.json() };
}

async function request(
  path: string,
  init: RequestInit,
): Promise<Response | MutationFailure> {
  try {
    return await apiFetch(path, init);
  } catch (error) {
    unstable_rethrow(error);

    return UNREACHABLE_FAILURE;
  }
}
