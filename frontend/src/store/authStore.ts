import { create } from 'zustand';

interface AuthUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR';
}

interface AuthStore {
  user: AuthUser | null;
  accessToken: string | null;
  setAuth: (user: AuthUser, token: string) => void;
  setAccessToken: (token: string) => void;
  logout: () => void;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: null,
  setAuth: (user, accessToken) => set({ user, accessToken }),
  setAccessToken: (accessToken) => set({ accessToken }),
  logout: () => set({ user: null, accessToken: null }),
  isAdmin: () => get().user?.role === 'ADMIN',
}));
