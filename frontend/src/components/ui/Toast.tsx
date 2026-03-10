'use client';

import { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'warning';

interface ToastProps {
  message: string;
  type?: ToastType;
  onClose: () => void;
}

export function Toast({ message, type = 'success', onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bg = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
  }[type];

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-md text-sm max-w-sm ${bg}`}
    >
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 font-bold text-base leading-none">
        ×
      </button>
    </div>
  );
}

// Simple toast state hook
import { useCallback } from 'react';

interface ToastState {
  message: string;
  type: ToastType;
  id: number;
}

let toastId = 0;

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const show = useCallback((message: string, type: ToastType = 'success') => {
    setToast({ message, type, id: ++toastId });
  }, []);

  const hide = useCallback(() => setToast(null), []);

  return { toast, show, hide };
}
