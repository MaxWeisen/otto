"use client";

import { useEffect, useState } from "react";
import {
  cachedVehicleModels,
  loadVehicleModels,
  modelsCacheKey,
} from "@/lib/vpic-client";

export type VehicleModelsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; models: readonly string[] }
  | { status: "error"; message: string };

/**
 * Loads the models NHTSA lists for a make and model year. Stays idle until
 * both are known.
 */
export function useVehicleModels(
  makeName: string | null,
  year: number | null,
): VehicleModelsState {
  const key = makeName && year ? modelsCacheKey(makeName, year) : null;
  const [failure, setFailure] = useState<{ key: string; message: string }>();
  const [, setLoadedKey] = useState<string>();

  useEffect(() => {
    if (!makeName || !year || cachedVehicleModels(makeName, year)) {
      return;
    }

    const controller = new AbortController();
    const requestKey = modelsCacheKey(makeName, year);

    loadVehicleModels(makeName, year, controller.signal).then(
      () => setLoadedKey(requestKey),
      (error: Error) => {
        if (!controller.signal.aborted) {
          setFailure({ key: requestKey, message: error.message });
        }
      },
    );

    return () => controller.abort();
  }, [makeName, year]);

  if (!makeName || !year || !key) {
    return { status: "idle" };
  }

  const models = cachedVehicleModels(makeName, year);

  if (models) {
    return { status: "ready", models };
  }

  if (failure?.key === key) {
    return { status: "error", message: failure.message };
  }

  return { status: "loading" };
}
