"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

type ToastType = "success" | "error" | "info" | "warning";

export function Toast({
  message,
  type,
  clearParams = false,
}: {
  message: string;
  type: ToastType;
  clearParams?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!message) return;
    toast[type](message, { id: `toast-${message}` });
    if (clearParams) {
      router.replace(pathname);
    }
  }, [message, type, clearParams, router, pathname]);
  return null;
}
