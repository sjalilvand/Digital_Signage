import { create } from 'zustand';

export interface ToastItem {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (kind: ToastItem['kind'], message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, message) => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, kind, message }] });
    // حذف خودکار پس از ۵ ثانیه
    setTimeout(() => get().dismiss(id), 5000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (message: string) => useToast.getState().push('success', message),
  error: (message: string) => useToast.getState().push('error', message),
  info: (message: string) => useToast.getState().push('info', message),
};
