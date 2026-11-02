import "server-only";
import { cache } from "react";
import { notFound, unstable_rethrow } from "next/navigation";
import { apiFetch, readApiError } from "@/lib/api";
import type { VehicleInput } from "@/lib/vehicle-schema";

export type Vehicle = {
  id: number;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  vin: string | null;
  nickname: string | null;
  mileage: number | null;
};

export type MutationResult<T> =
  { ok: true; data: T } | { ok: false; status: number; error: string };

export async function listVehicles(): Promise<Vehicle[]> {
  const response = await apiFetch("/api/vehicles");

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}

/**
 * Loads one of the visitor's vehicles. An id that is not a vehicle id, or a
 * vehicle the visitor does not own, shows the not-found page; the backend
 * answers 404 for both missing and other people's vehicles.
 */
export const getVehicle = cache(async (id: string): Promise<Vehicle> => {
  if (!isVehicleId(id)) {
    notFound();
  }

  const response = await apiFetch(`/api/vehicles/${id}`);

  if (response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
});

function isVehicleId(id: string): boolean {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
}

export function createVehicle(
  input: VehicleInput,
): Promise<MutationResult<Vehicle>> {
  return sendVehicle("/api/vehicles", "POST", input);
}

/**
 * Replaces all of one of the visitor's vehicles' fields. An id that is not a
 * vehicle id, or a vehicle that does not exist or belongs to someone else,
 * shows the not-found page, like getVehicle. The id arrives from the browser
 * through a server action, so it is checked to really be a number.
 */
export async function updateVehicle(
  id: number,
  input: VehicleInput,
): Promise<MutationResult<Vehicle>> {
  if (!Number.isSafeInteger(id) || id < 1) {
    notFound();
  }

  const result = await sendVehicle(`/api/vehicles/${id}`, "PUT", input);

  if (!result.ok && result.status === 404) {
    notFound();
  }

  return result;
}

async function sendVehicle(
  path: string,
  method: "POST" | "PUT",
  input: VehicleInput,
): Promise<MutationResult<Vehicle>> {
  let response: Response;

  try {
    response = await apiFetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (error) {
    unstable_rethrow(error);

    return {
      ok: false,
      status: 502,
      error: "Could not reach the server. Please try again.",
    };
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
