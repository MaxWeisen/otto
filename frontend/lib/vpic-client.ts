// Browser-side helpers for the NHTSA vPIC lookups, called through the
// app/api/vpic route handlers so the session cookie reaches the backend.

import { capitalize } from "@/lib/utils";

export type DecodedVin = {
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
};

export class VpicError extends Error {}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    throw new VpicError("Could not reach the server. Please try again.");
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof body?.error === "string" && body.error
        ? capitalize(body.error)
        : "Something went wrong. Please try again.";

    throw new VpicError(message);
  }

  return body as T;
}

const modelsCache = new Map<string, readonly string[]>();

export function modelsCacheKey(makeName: string, year: number): string {
  return `${makeName.toLowerCase()}|${year}`;
}

export function cachedVehicleModels(
  makeName: string,
  year: number,
): readonly string[] | undefined {
  return modelsCache.get(modelsCacheKey(makeName, year));
}

/** Loads the models NHTSA lists for a make and model year. */
export async function loadVehicleModels(
  makeName: string,
  year: number,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  const key = modelsCacheKey(makeName, year);
  const cached = modelsCache.get(key);

  if (cached) {
    return cached;
  }

  const query = new URLSearchParams({ make: makeName, year: String(year) });
  const { models } = await getJson<{ models: string[] }>(
    `/api/vpic/models?${query}`,
    signal,
  );

  modelsCache.set(key, models);

  return models;
}

/** Decodes the year, make, model and trim from a VIN. */
export function decodeVin(vin: string): Promise<DecodedVin> {
  return getJson<DecodedVin>(`/api/vpic/decode/${encodeURIComponent(vin)}`);
}
