import "server-only";
import { apiFetch, readApiError } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth";
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

  if (response.status === 401) {
    redirectToLogin();
  }

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json();
}

export async function createVehicle(
  input: VehicleInput,
): Promise<MutationResult<Vehicle>> {
  const response = await apiFetch("/api/vehicles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: await readApiError(response),
    };
  }

  return { ok: true, data: await response.json() };
}
