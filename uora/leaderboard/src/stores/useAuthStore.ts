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
  login: (user: User) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: (user: User) =>
        set({ user, isAuthenticated: true, isLoading: false }),
      logout: () =>
        set({ user: null, isAuthenticated: false, isLoading: false }),
      setLoading: (isLoading: boolean) => set({ isLoading }),
    }),
    {
      name: "uora-auth",
    }
  )
);
