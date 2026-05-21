import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  team?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isDemo: boolean;
  login: (user: User, demo?: boolean) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isDemo: false,
      login: (user: User, demo = false) =>
        set({ user, isAuthenticated: true, isLoading: false, isDemo: demo }),
      logout: () =>
        set({ user: null, isAuthenticated: false, isLoading: false, isDemo: false }),
      setLoading: (isLoading: boolean) => set({ isLoading }),
    }),
    {
      name: "uora-auth",
    }
  )
);
