import { useEffect, useState } from "react";

/** The current time, re-read once a minute - not useCountdown's 1Hz seconds (that hook exists for
 * a ~60s OTP resend timer; a multi-day race countdown or a "has the race started yet" check
 * re-rendering every second would just be wasted work for a number that only ever needs to change
 * once a minute at this resolution). `Date.now()` itself is impure - reading it directly in a
 * component body during render is a real lint error (react-hooks/purity, "Cannot call impure
 * function during render") - going through state initialized once and only ever updated inside an
 * effect is what keeps render itself pure while the value still ticks forward for anyone rendering
 * it live. Shared by PickPanel (race-start lock) and RaceWeekendPanel (countdown + session state). */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
