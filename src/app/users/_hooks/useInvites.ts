import { useCallback, useRef, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserInvite } from "@/lib/supabase/invites";
import { usersKeys } from "../_queries/usersKeys";
import { fetchInvites, postInvites, postResendInvite, postRevokeInvite } from "../_service/invites.client";

/** Unlike the user list, invites have no realtime listener feeding them — AppRealtimeSync watches
 * `profiles`, not `user_invites`. A short staleTime rather than Infinity is what keeps a second
 * admin's invite from staying invisible here indefinitely, without polling. */
export function useInvites(initialInvites: UserInvite[], enabled: boolean) {
  return useQuery({
    queryKey: usersKeys.invites(),
    queryFn: fetchInvites,
    initialData: initialInvites,
    staleTime: 30_000,
    enabled,
  });
}

/** Invalidates the user list alongside the invite list: redemption flips an invite to accepted
 * *and* creates a profile, so after any invite mutation both tables can be out of date. */
function useInviteMutation<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKeys.invites() });
      void queryClient.invalidateQueries({ queryKey: usersKeys.list() });
    },
  });
}

export function useSendInvites() {
  return useInviteMutation(postInvites);
}

export function useRevokeInvite() {
  return useInviteMutation(postRevokeInvite);
}

export function useResendInvite() {
  return useInviteMutation(postResendInvite);
}

/**
 * A clock that is safe to read during render.
 *
 * Invite status is time-derived (an invite becomes expired because the clock moved, not because
 * anything wrote to it), so something has to supply "now" — but `Date.now()` in a render body is
 * impure, and setting it from an effect is a cascading render. A ticking clock is precisely an
 * external mutable source, which is what useSyncExternalStore exists for.
 *
 * `getSnapshot` must return a value that is stable between ticks or React re-renders forever
 * comparing snapshots, hence the ref: the interval writes the new time, then notifies. Until the
 * first tick — including during SSR, via `getServerSnapshot` — the answer is the timestamp the
 * server rendered with, so the first paint already shows correct statuses instead of a
 * placeholder, and hydration matches.
 */
export function useNow(seedIso: string, intervalMs = 60_000): number {
  const cached = useRef<number | null>(null);

  const subscribe = useCallback(
    (onChange: () => void) => {
      const tick = () => {
        cached.current = Date.now();
        onChange();
      };
      tick(); // adopt the real client clock immediately on mount, not one interval later
      const id = setInterval(tick, intervalMs);
      return () => clearInterval(id);
    },
    [intervalMs],
  );

  const seed = Date.parse(seedIso);
  const getSnapshot = useCallback(() => cached.current ?? seed, [seed]);
  const getServerSnapshot = useCallback(() => seed, [seed]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
