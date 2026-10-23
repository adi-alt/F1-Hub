import { z } from "zod";

/** A person's built avatar (profiles.avatar, 20261030_profile_avatar_config.sql): a few option ids and palette
 * colours, drawn as inline SVG by components/avatar/AvatarSvg.tsx. Nothing outside these lists is ever stored. */

/** Colours that read on the dark UI: saturated enough to be seen, light enough not to sink into the page. */
export const PALETTE = [
  "#e10600", "#ff8000", "#ffd400", "#64c4ff", "#27f4d2", "#229971",
  "#3671c6", "#6c2bd9", "#ff87bc", "#b6babd", "#f5f5f5", "#1c1c22",
] as const;

export const HELMET_SHAPES = ["classic", "aero", "retro"] as const;
export const HELMET_PATTERNS = ["plain", "stripe", "twin", "chevron", "halo", "split", "flames", "stars"] as const;
export const VISORS = ["#1a1a1f", "#3a6ea5", "#c0c6cc", "#d4a017", "#b23a48", "#2f8f6f"] as const;

export const FACE_SHAPES = ["round", "oval", "square"] as const;
export const SKIN_TONES = ["#fde0c8", "#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#5c3a21"] as const;
export const HAIR_STYLES = ["none", "short", "buzz", "curly", "long", "bun", "mohawk"] as const;
export const HAIR_COLOURS = ["#1b1b1b", "#4a2f1b", "#8a5a2b", "#d9b56b", "#b5482f", "#d8d8d8", "#5b7cfa"] as const;
export const EYES = ["dots", "round", "happy", "wink"] as const;
export const BROWS = ["flat", "raised", "angled"] as const;
export const MOUTHS = ["smile", "grin", "neutral", "open"] as const;
export const FACIAL_HAIR = ["none", "stubble", "moustache", "beard"] as const;
export const GLASSES = ["none", "round", "square", "shades"] as const;

const one = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

export const helmetAvatarSchema = z.strictObject({
  style: z.literal("helmet"),
  shape: one(HELMET_SHAPES),
  base: one(PALETTE),
  accent1: one(PALETTE),
  accent2: one(PALETTE),
  pattern: one(HELMET_PATTERNS),
  visor: one(VISORS),
  number: z.number().int().min(0).max(99),
});

export const faceAvatarSchema = z.strictObject({
  style: z.literal("face"),
  face: one(FACE_SHAPES),
  skin: one(SKIN_TONES),
  hair: one(HAIR_STYLES),
  hairColour: one(HAIR_COLOURS),
  eyes: one(EYES),
  brows: one(BROWS),
  mouth: one(MOUTHS),
  facialHair: one(FACIAL_HAIR),
  glasses: one(GLASSES),
  collar: one(PALETTE),
});

export const avatarSchema = z.discriminatedUnion("style", [helmetAvatarSchema, faceAvatarSchema]);

export type HelmetAvatar = z.infer<typeof helmetAvatarSchema>;
export type FaceAvatar = z.infer<typeof faceAvatarSchema>;
export type AvatarConfig = z.infer<typeof avatarSchema>;

/** A stored value as the app should use it: a valid config, or null (so a bad row falls back to the default). */
export function parseAvatar(value: unknown): AvatarConfig | null {
  const parsed = avatarSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** A small seeded generator (mulberry32), so one seed always builds the same avatar. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function randomAvatar(style: AvatarConfig["style"], random: () => number = Math.random): AvatarConfig {
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  if (style === "helmet") {
    const base = pick(PALETTE);
    const others = PALETTE.filter((c) => c !== base);
    return {
      style,
      shape: pick(HELMET_SHAPES),
      base,
      accent1: pick(others),
      accent2: pick(others),
      pattern: pick(HELMET_PATTERNS),
      visor: pick(VISORS),
      number: Math.floor(random() * 100),
    };
  }
  return {
    style,
    face: pick(FACE_SHAPES),
    skin: pick(SKIN_TONES),
    hair: pick(HAIR_STYLES),
    hairColour: pick(HAIR_COLOURS),
    eyes: pick(EYES),
    brows: pick(BROWS),
    mouth: pick(MOUTHS),
    facialHair: pick(FACIAL_HAIR),
    glasses: pick(GLASSES),
    collar: pick(PALETTE),
  };
}

/** Everyone without a built avatar gets a helmet derived from their id: the same one on every page, for everyone. */
export function defaultAvatar(id: string, style: AvatarConfig["style"] = "helmet"): AvatarConfig {
  return randomAvatar(style, seeded(hash(id)));
}
