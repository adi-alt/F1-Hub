import { useEffect, useState } from "react";

/** Returns `value`, but only after it's stopped changing for `delayMs` — the standard debounce
 * pattern for "wait until the user stops typing" before firing a network call. */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
