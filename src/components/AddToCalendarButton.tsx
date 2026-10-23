import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** The /api/calendar/ics download (audit R-54): one race weekend's sessions, or the whole season's. */
export function calendarIcsHref(year: number, round?: number): string {
  return `/api/calendar/ics?year=${year}${round ? `&round=${round}` : ""}`;
}

/** "Add to calendar": downloads an .ics of the weekend's (or season's) sessions, which any calendar app imports. */
export function AddToCalendarButton({ year, round, label = "Add to calendar", className }: { year: number; round?: number; label?: string; className?: string }) {
  return (
    <Button asChild variant="secondary" size="sm" iconStart={CalendarPlus} className={className}>
      <a href={calendarIcsHref(year, round)} download>
        {label}
      </a>
    </Button>
  );
}
