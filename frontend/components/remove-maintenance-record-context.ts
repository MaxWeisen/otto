"use client";

import { createContext, useContext } from "react";

export const RemoveMaintenanceRecordContext = createContext<
  (id: number) => void
>(() => {});

export function useRemoveMaintenanceRecord() {
  return useContext(RemoveMaintenanceRecordContext);
}
