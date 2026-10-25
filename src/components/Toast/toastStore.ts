import { create } from 'zustand';

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

export interface ToastState {
  toast: (ToastOptions & { id: number; durationMs: number }) | null;
  show: (options: ToastOptions) => void;
  dismissToast: () => void;
}

let nextId = 1;
export const DEFAULT_TOAST_MS = 5000;

export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  show: (options) =>
    set({ toast: { ...options, id: nextId++, durationMs: options.durationMs ?? DEFAULT_TOAST_MS } }),
  dismissToast: () => set({ toast: null }),
}));

/** One toast at a time: a new one replaces the current one. */
export function showToast(options: ToastOptions): void {
  useToastStore.getState().show(options);
}
