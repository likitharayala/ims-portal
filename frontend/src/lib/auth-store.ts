'use client';

import { create } from 'zustand';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'student';
  instituteId: string;
  instituteName?: string;
  mustChangePassword: boolean;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isLoaded: boolean;
  setAuth: (
    accessToken: string,
    refreshToken: string,
    user: AuthUser,
  ) => void;
  clearAuth: () => void;
  setLoaded: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  isLoaded: false,

  setAuth: (accessToken, refreshToken, user) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
    }
    set({ accessToken, refreshToken, user });
  },

  clearAuth: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
    set({ accessToken: null, refreshToken: null, user: null });
  },

  setLoaded: () => set({ isLoaded: true }),
}));

/** Call on app mount to rehydrate from localStorage */
export function rehydrateAuth() {
  if (typeof window === 'undefined') return;
  const store = useAuthStore.getState();
  const accessToken = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');
  const userRaw = localStorage.getItem('user');
  if (accessToken && refreshToken && userRaw) {
    try {
      const user = JSON.parse(userRaw) as AuthUser;
      store.setAuth(accessToken, refreshToken, user);
    } catch {
      store.clearAuth();
    }
  }
  store.setLoaded();
}
