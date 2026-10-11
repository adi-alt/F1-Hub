const SEPARATOR = " · ";

/** Either a time already formatted by the caller, or a Date formatted here in a given zone. */
type ProvenanceTime =
  | {
      /** Already formatted: "17:42", "3 min ago", "Sun 4 Oct 17:42". */
      updated?: string;
      updatedAt?: never;
      timeZone?: never;
    }
  | {
      /** Printed as 24-hour "HH:mm", so pass `updated` instead for anything that may not be today. */
      updatedAt: Date;
      /** IANA zone the time is shown in, e.g. "Europe/London". Required: a server has no idea of the reader's zone. */
      timeZone: string;
      updated?: never;
    };

export type Provenance = {
  /** Sentence case, it starts the line: "Official classification", "OpenF1", "Apex model v2". */
  source: string;
  /** Lower case, it follows a separator: "preliminary", "back-filled after the race". */
  status?: string;
} & ProvenanceTime;

export type ProvenanceLineProps = Provenance & {
  /** Layout only: margin, width, grid placement. */
  className?: string;
};

/** "17:42" in `timeZone`. Pinned to en-GB with a 23-hour clock so the server and every browser print the
 * same string (no hydration mismatch, no "24:05"); undefined for an invalid date. */
export function formatProvenanceTime(date: Date, timeZone: string): string | undefined {
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(date);
}

/** The line as plain text, skipping empty parts so it never starts or ends with a separator. */
export function provenanceText(parts: { source: string; status?: string; updated?: string }): string {
  return [parts.source, parts.status, parts.updated && `updated ${parts.updated}`].filter(Boolean).join(SEPARATOR);
}

function resolveTime(time: ProvenanceTime): { text: string; dateTime?: string } | undefined {
  if (time.updatedAt) {
    const text = formatProvenanceTime(time.updatedAt, time.timeZone);
    return text ? { text, dateTime: time.updatedAt.toISOString() } : undefined;
  }
  return time.updated ? { text: time.updated } : undefined;
}

/**
 * Where data comes from and how fresh it is: "Official classification · preliminary · updated 17:42",
 * in caption text-tertiary. Mandatory on results, predictions, AI output and weather (spec §4.11).
 */
export function ProvenanceLine({ className, ...provenance }: ProvenanceLineProps) {
  const time = resolveTime(provenance);
  const lead = provenanceText({ source: provenance.source, status: provenance.status });
  return (
    <p className={["text-caption text-tertiary tabular", className].filter(Boolean).join(" ")}>
      {lead}
      {time && (
        <>
          {lead && SEPARATOR}
          updated {time.dateTime ? <time dateTime={time.dateTime}>{time.text}</time> : time.text}
        </>
      )}
    </p>
  );
}
