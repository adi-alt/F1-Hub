import { useQuery } from "@tanstack/react-query";

export type SignupOptions = { drivers: { code: string; name: string; team: string }[]; teams: string[]; tracks: string[] };

async function fetchSignupOptions(): Promise<SignupOptions> {
  try {
    const res = await fetch("/api/auth/signup-options");
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch {
    // These fields are all optional on the signup form — an empty list just means empty
    // dropdowns, not a blocked signup, so this degrades gracefully rather than erroring out.
    return { drivers: [], teams: [], tracks: [] };
  }
}

/** staleTime: Infinity — this season's grid doesn't change moment to moment, and the dialog is
 * opened/closed repeatedly in one sitting with no reason to refetch each time. */
export function useSignupOptions(enabled: boolean) {
  return useQuery({
    queryKey: ["signup-options"],
    queryFn: fetchSignupOptions,
    staleTime: Infinity,
    enabled,
  });
}
