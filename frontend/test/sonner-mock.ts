import type { toast as sonnerToast } from "sonner";
import { vi } from "vitest";

/**
 * A stand-in for sonner's toast, registered with vi.mock in test/setup.ts, so
 * tests check which toasts the app shows without rendering them. Import
 * toast from "sonner" in a test to assert on these spies.
 */
export const toast = Object.assign(vi.fn(), {
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  custom: vi.fn(),
  message: vi.fn(),
  promise: vi.fn(),
  dismiss: vi.fn(),
  loading: vi.fn(),
  getHistory: vi.fn(() => []),
  getToasts: vi.fn(() => []),
}) satisfies Record<keyof typeof sonnerToast, unknown>;
