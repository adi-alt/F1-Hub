import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";

type Availability = { available: boolean; suggestions?: string[] };

async function fetchAvailability(username: string): Promise<Availability> {
  const res = await fetch(`/api/username/check?u=${encodeURIComponent(username)}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/** Debounced live availability check as the user types a username — the query key changes only
 * once typing pauses for 400ms, so keystrokes themselves never fire a request. */
export function useUsernameAvailability(username: string) {
  const debounced = useDebounce(username.trim(), 400);
  const enabled = debounced.length >= 3;

  const { data, isFetching } = useQuery({
    queryKey: ["username-availability", debounced],
    queryFn: () => fetchAvailability(debounced),
    enabled,
    staleTime: 30_000,
  });

  const status: "idle" | "checking" | "available" | "taken" = !enabled
    ? "idle"
    : isFetching || !data
      ? "checking"
      : data.available
        ? "available"
        : "taken";

  return { status, suggestions: data?.suggestions ?? [] };
}
