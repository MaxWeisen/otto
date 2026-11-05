import "server-only";
import { notFound, unstable_rethrow } from "next/navigation";
import { apiFetch, readApiError } from "@/lib/api";
import type {
  MaintenanceInput,
  MaintenanceType,
} from "@/lib/maintenance-schema";
import type { MutationResult } from "@/lib/vehicles";

export type MaintenanceRecord = {
  id: number;
  vehicle_id: number;
  type: MaintenanceType;
  description: string;
  /** YYYY-MM-DD */
  performed_at: string;
  mileage: number | null;
  /** A decimal string such as "49.99". */
  cost: string | null;
  notes: string | null;
  created_at: string;
};

type MutationFailure = Extract<MutationResult<unknown>, { ok: false }>;

// Ids arrive from the URL or, through server actions, from the browser.
function isId(id: string | number): boolean {
  return typeof id === "number"
    ? Number.isSafeInteger(id) && id > 0
    : /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
}

function recordsPath(vehicleId: string | number, recordId?: number): string {
  if (!isId(vehicleId) || (recordId !== undefined && !isId(recordId))) {
    notFound();
  }

  const base = `/api/vehicles/${vehicleId}/maintenance`;

  return recordId === undefined ? base : `${base}/${recordId}`;
}

/**
 * Newest first. A vehicle that does not exist or belongs to someone else
 * shows the not-found page.
 */
export async function listMaintenanceRecords(
  vehicleId: string,
): Promise<MaintenanceRecord[]> {
  const response = await apiFetch(recordsPath(vehicleId));

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

// A 404 here can mean the record or the vehicle is gone, so the caller
// decides what to show instead of the whole page turning into not-found.
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

    return {
      ok: false,
      status: 502,
      error: "Could not reach the server. Please try again.",
    };
  }
}
