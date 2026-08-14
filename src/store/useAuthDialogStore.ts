import { create } from "zustand";

type AuthDialogStore = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

/** One shared dialog instance, openable from anywhere ("sign in to do X" just calls
 * useAuthDialogStore.getState().open() — no prop-drilling a callback down through Header).
 * Previously SignInButton and SignInGate each held their own local dialogOpen state and mounted
 * their own <AuthDialog>, meaning two independent instances could exist depending on which
 * trigger was clicked. */
export const useAuthDialogStore = create<AuthDialogStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
