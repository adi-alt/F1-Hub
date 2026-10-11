"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { Surface } from "@/components/ui/Surface";
import { groupCandidates, MAX_RACE_PHOTOS, type CandidateGroup, type RacePhoto, type RacePhotoCandidate } from "@/lib/racePhotos";

const SUBJECT_LABEL: Record<RacePhotoCandidate["subject"], string> = {
  car: "Car on track",
  podium: "Podium",
  driver: "Driver / paddock",
  atmosphere: "Atmosphere",
  general: "Race weekend",
};

async function post(action: "approve" | "reject" | "remove", id: number): Promise<string | null> {
  const res = await fetch("/api/admin/race-photos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, id }),
  });
  if (res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Something went wrong (${res.status}).`;
}

/** The credit exactly as the race page shows it: photographer linked to the Commons page, licence to its deed. */
function Credit({ photo }: { photo: Pick<RacePhoto, "photographer" | "license" | "licenseUrl" | "sourceUrl"> }) {
  return (
    <p className="text-caption text-secondary">
      Photo:{" "}
      <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
        {photo.photographer}
      </a>
      ,{" "}
      <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer license" className="underline-offset-4 hover:underline">
        {photo.license}
      </a>
    </p>
  );
}

/** A Wikimedia thumbnail at its own aspect ratio: never cropped. */
function Thumb({ photo, className }: { photo: Pick<RacePhoto, "thumbnailUrl" | "altText" | "width" | "height">; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Wikimedia's own thumbnail, loaded straight from upload.wikimedia.org on purpose (no Vercel optimisation, no Supabase Storage)
    <img
      src={photo.thumbnailUrl}
      alt={photo.altText}
      width={photo.width}
      height={photo.height}
      loading="lazy"
      decoding="async"
      className={["h-auto w-full rounded-control bg-surface-2 object-contain", className].filter(Boolean).join(" ")}
    />
  );
}

function GroupCard({ group, full, busy, act }: { group: CandidateGroup; full: boolean; busy: number | null; act: (a: "approve" | "reject", id: number) => void }) {
  const frames = [group.best, ...group.alternates];
  const [index, setIndex] = useState(0);
  const photo = frames[index];
  return (
    <Surface level={1} padding="md" as="article" aria-label={photo.altText}>
      <Thumb photo={photo} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{SUBJECT_LABEL[group.subject]}</Badge>
        <span className="text-caption tabular text-tertiary">
          score {photo.score} · {photo.width}×{photo.height}
          {photo.takenOn ? ` · ${photo.takenOn}` : ""}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-body-sm text-primary">{photo.altText}</p>
      <div className="mt-1">
        <Credit photo={photo} />
      </div>
      {frames.length > 1 && (
        <div className="mt-3">
          <p className="text-caption text-secondary">Other frames from this sequence</p>
          <div className="mt-2 grid grid-cols-6 gap-1.5">
            {frames.map((f, i) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-pressed={i === index}
                aria-label={`Frame ${i + 1} of ${frames.length}`}
                className={`rounded-control outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring ${i === index ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"}`}
              >
                <Thumb photo={f} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" disabled={full} loading={busy === photo.id} onClick={() => act("approve", photo.id)}>
          Approve this frame
        </Button>
        <Button variant="ghost" size="sm" loading={busy === -photo.id} onClick={() => act("reject", photo.id)}>
          Reject
        </Button>
      </div>
    </Surface>
  );
}

export function RacePhotoReview({ raceName, candidates, approved }: { raceName: string; candidates: RacePhotoCandidate[]; approved: RacePhoto[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  // The outcome of the last action, announced to screen readers (this app mounts no toast provider).
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const pending = groupCandidates(candidates.filter((c) => c.status === "pending"));
  const rejected = candidates.filter((c) => c.status === "rejected").length;
  const full = approved.length >= MAX_RACE_PHOTOS;

  async function act(action: "approve" | "reject" | "remove", id: number) {
    setBusy(action === "reject" ? -id : id);
    const error = await post(action, id);
    setBusy(null);
    if (error) {
      setStatus({ tone: "error", text: error });
      return;
    }
    setStatus({ tone: "ok", text: action === "approve" ? "Approved. It shows on the race page now." : action === "remove" ? "Removed from the race page." : "Rejected." });
    router.refresh();
  }

  return (
    <div className="space-y-12">
      <p role="status" className={`min-h-5 text-body-sm ${status?.tone === "error" ? "text-danger" : "text-success"}`}>
        {status?.text}
      </p>
      <Section
        id="approved"
        title={`On the race page (${approved.length} of ${MAX_RACE_PHOTOS})`}
        level={2}
        description={approved.length === 0 ? `Nothing approved for ${raceName} yet, so the race page shows no photo section.` : "In this order. Remove one to free a place."}
      >
        {approved.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {approved.map((p) => (
              <Surface key={p.id} level={1} padding="md" as="article" aria-label={p.altText}>
                <Thumb photo={p} />
                <p className="mt-2 text-caption tabular text-tertiary">#{p.rank}</p>
                <Credit photo={p} />
                <Button variant="ghost" size="sm" className="mt-3" loading={busy === p.id} onClick={() => act("remove", p.id)}>
                  Remove
                </Button>
              </Surface>
            ))}
          </div>
        )}
      </Section>

      <Section
        id="candidates"
        title="Candidates"
        level={2}
        description={
          pending.length === 0
            ? `No candidates waiting.${rejected ? ` ${rejected} rejected.` : ""} The weekly scan adds any new uploads to Commons.`
            : `${pending.length} photo groups, best frame first. Every one passed the licence check (CC0, public domain, CC BY or CC BY-SA) and has a full credit.${full ? " The race has four photos: remove one to approve another." : ""}`
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pending.map((g) => (
            <GroupCard key={g.groupKey} group={g} full={full} busy={busy} act={act} />
          ))}
        </div>
      </Section>
    </div>
  );
}
