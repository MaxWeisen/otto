import "server-only";
import { notFound, unstable_rethrow } from "next/navigation";
import { apiFetch, readApiError } from "@/lib/api";
import type { MaintenanceType } from "@/lib/maintenance-format";

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

export type MaintenanceInput = {
  type: string;
  description: string;
  performed_at: string;
  mileage: string | null;
  cost: string | null;
  notes: string | null;
};

export type MaintenanceResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      error: string;
      errors?: Record<string, string>;
    };

function recordsPath(vehicleId: number, recordId?: number): string {
  const ids = recordId === undefined ? [vehicleId] : [vehicleId, recordId];

  if (!ids.every((id) => Number.isSafeInteger(id) && id > 0)) {
    notFound();
  }

  const base = `/api/vehicles/${vehicleId}/maintenance`;

  return recordId === undefined ? base : `${base}/${recordId}`;
}

export async function listMaintenanceRecords(
  vehicleId: string,
): Promise<MaintenanceRecord[]> {
  if (!/^[1-9]\d*$/.test(vehicleId)) {
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

export function saveMaintenanceRecord(
  vehicleId: number,
  recordId: number | undefined,
  input: MaintenanceInput,
): Promise<MaintenanceResult> {
  return send(recordsPath(vehicleId, recordId), {
    method: recordId === undefined ? "POST" : "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteMaintenanceRecord(
  vehicleId: number,
  recordId: number,
): Promise<MaintenanceResult> {
  return send(recordsPath(vehicleId, recordId), { method: "DELETE" });
}

async function send(
  path: string,
  init: RequestInit,
): Promise<MaintenanceResult> {
  let response: Response;

  try {
    response = await apiFetch(path, init);
  } catch (error) {
    unstable_rethrow(error);

    return {
      ok: false,
      status: 502,
      error: "Could not reach the server. Please try again.",
    };
  }

  if (response.ok) {
    return { ok: true };
  }

  const errors =
    response.status === 400
      ? (
          await response
            .clone()
            .json()
            .catch(() => null)
        )?.errors
      : undefined;

  return {
    ok: false,
    status: response.status,
    error: await readApiError(response),
    errors,
  };
}
