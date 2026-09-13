import { create } from "zustand";

type AuthDialogStore = {
  isOpen: boolean;
  // True when the dialog should mount straight onto the OTP step (the OAuth redirect round trip
  // already sent the code by the time this fires — see /auth/callback and AuthDialogHost.tsx) —
  // false for the normal "method" step every other entry point opens on.
  resumeAtOtp: boolean;
  open: () => void;
  openAtOtp: () => void;
  close: () => void;
};

/** One shared dialog instance, openable from anywhere ("sign in to do X" just calls
 * useAuthDialogStore.getState().open() — no prop-drilling a callback down through Header).
 * Previously SignInButton and SignInGate each held their own local dialogOpen state and mounted
 * their own <AuthDialog>, meaning two independent instances could exist depending on which
 * trigger was clicked. */
export const useAuthDialogStore = create<AuthDialogStore>((set) => ({
  isOpen: false,
  resumeAtOtp: false,
  open: () => set({ isOpen: true, resumeAtOtp: false }),
  openAtOtp: () => set({ isOpen: true, resumeAtOtp: true }),
  close: () => set({ isOpen: false, resumeAtOtp: false }),
}));
