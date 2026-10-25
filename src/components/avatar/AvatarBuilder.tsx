"use client";

import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { TabList, TabPanels, Tabs } from "@/components/ui/Tabs";
import { EYEBROW } from "@/components/ui/panel";
import { useAuth } from "@/providers/AuthProvider";
import {
  BROWS,
  EYES,
  FACE_SHAPES,
  FACIAL_HAIR,
  GLASSES,
  HAIR_COLOURS,
  HAIR_STYLES,
  HELMET_PATTERNS,
  HELMET_SHAPES,
  MOUTHS,
  PALETTE,
  SKIN_TONES,
  VISORS,
  defaultAvatar,
  randomAvatar,
  type AvatarConfig,
  type FaceAvatar,
  type HelmetAvatar,
} from "@/lib/avatar";
import { AvatarSvg } from "./AvatarSvg";

type Style = AvatarConfig["style"];
const STYLES = [
  { value: "helmet", label: "Helmet" },
  { value: "face", label: "Face" },
] as const;

const TILE =
  "relative flex shrink-0 items-center justify-center rounded-full transition-[box-shadow,transform] duration-fast hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-reduce:transition-none";
const SELECTED = "ring-2 ring-white ring-offset-2 ring-offset-surface-1";
const IDLE = "ring-1 ring-white/[0.08]";

const titleCase = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/** One category: a labelled row of tiles, each a toggle button showing what it would look like. */
function Row<T extends string>({ label, options, value, onPick, render, name }: { label: string; options: readonly T[]; value: T; onPick: (v: T) => void; render: (v: T) => ReactNode; name: (v: T) => string }) {
  return (
    <fieldset>
      <legend className={EYEBROW}>{label}</legend>
      {/* One line per category that scrolls sideways (no visible bar), so the builder stays short enough to fit a dialog. p-1 leaves room for the selected ring. */}
      <div className="scrollbar-hide -mx-1 mt-1 flex gap-2 overflow-x-auto p-1">
        {options.map((option) => (
          <button key={option} type="button" aria-pressed={option === value} aria-label={name(option)} title={name(option)} onClick={() => onPick(option)} className={`${TILE} ${option === value ? SELECTED : IDLE}`}>
            {render(option)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const swatch = (colour: string) => <span className="block size-8 rounded-full" style={{ background: colour }} />;

function HelmetRows({ h, set }: { h: HelmetAvatar; set: (next: HelmetAvatar) => void }) {
  const preview = (patch: Partial<HelmetAvatar>) => <AvatarSvg avatar={{ ...h, ...patch }} size={48} />;
  return (
    <>
      <Row label="Shape" options={HELMET_SHAPES} value={h.shape} onPick={(shape) => set({ ...h, shape })} render={(shape) => preview({ shape })} name={titleCase} />
      <Row label="Base colour" options={PALETTE} value={h.base} onPick={(base) => set({ ...h, base })} render={swatch} name={(c) => `Base ${c}`} />
      <Row label="Accent one" options={PALETTE} value={h.accent1} onPick={(accent1) => set({ ...h, accent1 })} render={swatch} name={(c) => `Accent one ${c}`} />
      <Row label="Accent two" options={PALETTE} value={h.accent2} onPick={(accent2) => set({ ...h, accent2 })} render={swatch} name={(c) => `Accent two ${c}`} />
      <Row label="Pattern" options={HELMET_PATTERNS} value={h.pattern} onPick={(pattern) => set({ ...h, pattern })} render={(pattern) => preview({ pattern })} name={titleCase} />
      <Row label="Visor" options={VISORS} value={h.visor} onPick={(visor) => set({ ...h, visor })} render={swatch} name={(c) => `Visor ${c}`} />
      <TextInput
        label="Racing number"
        hint="0 to 99."
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        value={h.number}
        onChange={(e) => {
          const n = Math.trunc(Number(e.target.value));
          if (Number.isFinite(n)) set({ ...h, number: Math.min(99, Math.max(0, n)) });
        }}
      />
    </>
  );
}

function FaceRows({ f, set }: { f: FaceAvatar; set: (next: FaceAvatar) => void }) {
  const preview = (patch: Partial<FaceAvatar>) => <AvatarSvg avatar={{ ...f, ...patch }} size={48} />;
  return (
    <>
      <Row label="Face" options={FACE_SHAPES} value={f.face} onPick={(face) => set({ ...f, face })} render={(face) => preview({ face })} name={titleCase} />
      <Row label="Skin tone" options={SKIN_TONES} value={f.skin} onPick={(skin) => set({ ...f, skin })} render={swatch} name={(c) => `Skin ${SKIN_TONES.indexOf(c as never) + 1}`} />
      <Row label="Hair" options={HAIR_STYLES} value={f.hair} onPick={(hair) => set({ ...f, hair })} render={(hair) => preview({ hair })} name={titleCase} />
      <Row label="Hair colour" options={HAIR_COLOURS} value={f.hairColour} onPick={(hairColour) => set({ ...f, hairColour })} render={swatch} name={(c) => `Hair colour ${c}`} />
      <Row label="Eyes" options={EYES} value={f.eyes} onPick={(eyes) => set({ ...f, eyes })} render={(eyes) => preview({ eyes })} name={titleCase} />
      <Row label="Eyebrows" options={BROWS} value={f.brows} onPick={(brows) => set({ ...f, brows })} render={(brows) => preview({ brows })} name={titleCase} />
      <Row label="Mouth" options={MOUTHS} value={f.mouth} onPick={(mouth) => set({ ...f, mouth })} render={(mouth) => preview({ mouth })} name={titleCase} />
      <Row label="Facial hair" options={FACIAL_HAIR} value={f.facialHair} onPick={(facialHair) => set({ ...f, facialHair })} render={(facialHair) => preview({ facialHair })} name={titleCase} />
      <Row label="Glasses" options={GLASSES} value={f.glasses} onPick={(glasses) => set({ ...f, glasses })} render={(glasses) => preview({ glasses })} name={titleCase} />
      <Row label="Race suit" options={PALETTE} value={f.collar} onPick={(collar) => set({ ...f, collar })} render={swatch} name={(c) => `Suit ${c}`} />
    </>
  );
}

/**
 * The avatar "store": a compact live preview, Helmet / Face tabs and a row of tiles per category. Everything is free.
 * Saves to PATCH /api/users/me and updates the header's copy; `onDone` runs after a save. `secondary` sits beside
 * Save (Skip during sign-up, Cancel in Settings).
 */
export function AvatarBuilder({ onDone, secondary, saveLabel = "Save avatar" }: { onDone?: () => void; secondary?: ReactNode; saveLabel?: string }) {
  const { user, avatar, setAvatar } = useAuth();
  const uid = user?.uid ?? "";
  const start = avatar ?? defaultAvatar(uid);
  const [style, setStyle] = useState<Style>(start.style);
  const [helmet, setHelmet] = useState<HelmetAvatar>(start.style === "helmet" ? start : (defaultAvatar(uid, "helmet") as HelmetAvatar));
  const [face, setFace] = useState<FaceAvatar>(start.style === "face" ? start : (defaultAvatar(uid, "face") as FaceAvatar));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = style === "helmet" ? helmet : face;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avatar: current }) });
      if (!res.ok) throw new Error(`${res.status}`);
      setAvatar(current);
      onDone?.();
    } catch {
      setError("Couldn't save your avatar. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-center gap-4">
        <motion.div key={JSON.stringify(current)} initial={{ scale: 0.96, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.18 }}>
          <AvatarSvg avatar={current} size={96} />
        </motion.div>
        <Button
          variant="ghost"
          size="sm"
          iconStart={Shuffle}
          onClick={() => (style === "helmet" ? setHelmet(randomAvatar("helmet") as HelmetAvatar) : setFace(randomAvatar("face") as FaceAvatar))}
        >
          Randomise
        </Button>
      </div>
      <Tabs variant="segmented" value={style} onValueChange={setStyle} items={STYLES}>
        <TabList aria-label="Avatar style" className="mx-auto flex w-fit" />
        <TabPanels className="mt-4 space-y-3">{style === "helmet" ? <HelmetRows h={helmet} set={setHelmet} /> : <FaceRows f={face} set={setFace} />}</TabPanels>
      </Tabs>
      <p className="text-caption text-tertiary">Every option is free. You can change it any time in Settings.</p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {error && (
          <p role="alert" className="mr-auto text-caption text-danger">
            {error}
          </p>
        )}
        {secondary}
        <Button variant="primary" size="sm" loading={saving} onClick={() => void save()}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
