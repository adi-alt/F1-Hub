import { create } from "zustand";

/** What an `?invite=` link resolved to — just the address and the role it reserves, which is
 * everything /api/invites/peek is willing to say about one. */
export type PendingInvite = { email: string; role: "admin" | "moderator" | null };

type AuthDialogStore = {
  isOpen: boolean;
  // True when the dialog should mount straight onto the OTP step (the OAuth redirect round trip
  // already sent the code by the time this fires — see /auth/callback and AuthDialogHost.tsx) —
  // false for the normal "method" step every other entry point opens on.
  resumeAtOtp: boolean;
  /** Non-null when the dialog was opened from an invitation link. */
  invite: PendingInvite | null;
  open: () => void;
  openAtOtp: () => void;
  openWithInvite: (invite: PendingInvite) => void;
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
  invite: null,
  open: () => set({ isOpen: true, resumeAtOtp: false, invite: null }),
  openAtOtp: () => set({ isOpen: true, resumeAtOtp: true }),
  openWithInvite: (invite) => set({ isOpen: true, resumeAtOtp: false, invite }),
  // The invite is deliberately NOT cleared on close: someone who dismisses the dialog and
  // reopens it from the header is still the person who followed that link.
  close: () => set({ isOpen: false, resumeAtOtp: false }),
}));
