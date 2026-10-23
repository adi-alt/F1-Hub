import { useId, type ReactNode } from "react";
import type { AvatarConfig, FaceAvatar, HelmetAvatar } from "@/lib/avatar";

/** The disc every avatar sits on: a step above the page, so a dark helmet or dark hair still has an edge. */
const DISC = "#1d1d24";
const INK = "#15151a";

const HELMET_SHELL: Record<HelmetAvatar["shape"], string> = {
  classic: "M16 64C16 36 36 18 58 18C78 18 90 34 90 54V70C90 77 86 81 79 81H30C21 81 16 73 16 64Z",
  aero: "M12 62C12 33 35 15 60 15C81 15 93 32 93 52V71C93 78 89 82 82 82H25C17 82 12 72 12 62Z",
  retro: "M20 66C20 37 38 20 57 20C76 20 88 36 88 58V81H25C22 77 20 72 20 66Z",
};

function helmetPattern(h: HelmetAvatar): ReactNode {
  const { accent1: a, accent2: b } = h;
  switch (h.pattern) {
    case "plain":
      return null;
    case "stripe":
      return <rect x="0" y="30" width="100" height="9" fill={a} />;
    case "twin":
      return (
        <>
          <rect x="0" y="26" width="100" height="6" fill={a} />
          <rect x="0" y="35" width="100" height="6" fill={b} />
        </>
      );
    case "chevron":
      return <path d="M0 40L30 40L46 56L30 72L0 72L16 56Z" fill={a} stroke={b} strokeWidth="3" />;
    case "halo":
      return <path d="M14 46C20 28 38 18 58 18C76 18 88 30 92 44" fill="none" stroke={a} strokeWidth="9" />;
    case "split":
      return (
        <>
          <rect x="0" y="64" width="100" height="20" fill={a} />
          <rect x="0" y="61" width="100" height="3" fill={b} />
        </>
      );
    case "flames":
      return <path d="M0 84V58L10 66L16 50L24 64L32 46L40 64L48 54L52 70L60 62L64 84Z" fill={a} stroke={b} strokeWidth="2" />;
    case "stars":
      return (
        <g fill={a} stroke={b} strokeWidth="1">
          {[
            [26, 34],
            [44, 26],
            [22, 50],
          ].map(([x, y]) => (
            <path key={`${x}-${y}`} d={`M${x} ${y - 6}L${x + 2} ${y - 2}L${x + 6} ${y - 1}L${x + 3} ${y + 2}L${x + 4} ${y + 6}L${x} ${y + 4}L${x - 4} ${y + 6}L${x - 3} ${y + 2}L${x - 6} ${y - 1}L${x - 2} ${y - 2}Z`} />
          ))}
        </g>
      );
  }
}

function Helmet({ h, clipId }: { h: HelmetAvatar; clipId: string }) {
  const shell = HELMET_SHELL[h.shape];
  return (
    <>
      <clipPath id={clipId}>
        <path d={shell} />
      </clipPath>
      <path d={shell} fill={h.base} />
      <g clipPath={`url(#${clipId})`}>
        {helmetPattern(h)}
        {/* The visor opening, its tint and a glint. */}
        <path d="M50 42H96V62H56C52 62 49 58 49 53Z" fill={INK} />
        <path d="M53 45H96V59H58C55 59 53 56 53 53Z" fill={h.visor} />
        <path d="M60 48H90" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
      </g>
      <path d={shell} fill="none" stroke={INK} strokeOpacity="0.5" strokeWidth="1.5" />
      {h.shape === "aero" && <path d="M14 50L6 46L8 56Z" fill={h.accent1} />}
      <circle cx="33" cy="60" r="11" fill="#f5f5f5" stroke={INK} strokeOpacity="0.4" />
      <text x="33" y="64.5" textAnchor="middle" fontSize={h.number > 9 ? 12 : 13} fontWeight="800" fontFamily="system-ui, sans-serif" fill={INK}>
        {h.number}
      </text>
    </>
  );
}

const HEAD: Record<FaceAvatar["face"], ReactNode> = {
  round: <circle cx="50" cy="46" r="22" />,
  oval: <ellipse cx="50" cy="46" rx="19" ry="24" />,
  square: <rect x="29" y="23" width="42" height="46" rx="12" />,
};

function hairBack(f: FaceAvatar): ReactNode {
  if (f.hair === "long") return <path d="M26 44C26 22 74 22 74 44V74H26Z" fill={f.hairColour} />;
  if (f.hair === "bun") return <circle cx="50" cy="18" r="8" fill={f.hairColour} />;
  return null;
}

function hairFront(f: FaceAvatar): ReactNode {
  const c = f.hairColour;
  switch (f.hair) {
    case "none":
      return null;
    case "short":
    case "bun":
      return <path d="M28 42C27 24 40 20 50 20C62 20 74 25 72 42C66 32 56 30 50 30C42 30 34 33 28 42Z" fill={c} />;
    case "buzz":
      return <path d="M29 38C31 26 40 22 50 22C60 22 69 26 71 38C64 30 36 30 29 38Z" fill={c} opacity="0.85" />;
    case "curly":
      return (
        <g fill={c}>
          {[30, 38, 46, 54, 62, 70].map((x, i) => (
            <circle key={x} cx={x} cy={i % 2 ? 24 : 28} r="7" />
          ))}
        </g>
      );
    case "long":
      return <path d="M27 44C26 24 40 20 50 20C62 20 75 25 73 44C68 30 58 28 50 30C44 31 34 34 27 44Z" fill={c} />;
    case "mohawk":
      return <path d="M45 30L46 12L50 18L54 12L55 30Z" fill={c} />;
  }
}

function eyes(f: FaceAvatar): ReactNode {
  const both = (draw: (x: number) => ReactNode) => (
    <g fill={INK} stroke={INK} strokeWidth="2" strokeLinecap="round">
      {draw(42)}
      {draw(58)}
    </g>
  );
  switch (f.eyes) {
    case "dots":
      return both((x) => <circle key={x} cx={x} cy="46" r="2" stroke="none" />);
    case "round":
      return both((x) => (
        <g key={x}>
          <circle cx={x} cy="46" r="4" fill="#ffffff" strokeWidth="1" />
          <circle cx={x + 0.5} cy="46.5" r="2" stroke="none" />
        </g>
      ));
    case "happy":
      return both((x) => <path key={x} d={`M${x - 4} 47Q${x} 42 ${x + 4} 47`} fill="none" />);
    case "wink":
      return (
        <g fill={INK} stroke={INK} strokeWidth="2" strokeLinecap="round">
          <circle cx="42" cy="46" r="2" stroke="none" />
          <path d="M54 46H62" />
        </g>
      );
  }
}

const BROW_PATH: Record<FaceAvatar["brows"], string> = {
  flat: "M37 39H46M54 39H63",
  raised: "M37 38Q41.5 35 46 38M54 38Q58.5 35 63 38",
  angled: "M37 37L46 40M54 40L63 37",
};

const MOUTH: Record<FaceAvatar["mouth"], ReactNode> = {
  smile: <path d="M43 56Q50 62 57 56" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />,
  grin: <path d="M42 55H58Q57 63 50 63Q43 63 42 55Z" fill="#ffffff" stroke={INK} strokeWidth="1.5" />,
  neutral: <path d="M44 58H56" stroke={INK} strokeWidth="2" strokeLinecap="round" />,
  open: <ellipse cx="50" cy="58" rx="4" ry="3.5" fill={INK} />,
};

function facialHair(f: FaceAvatar): ReactNode {
  const c = f.hairColour;
  switch (f.facialHair) {
    case "none":
      return null;
    case "stubble":
      return <path d="M32 52Q34 70 50 70Q66 70 68 52Q62 64 50 64Q38 64 32 52Z" fill={c} opacity="0.35" />;
    case "moustache":
      return <path d="M42 54Q46 50 50 53Q54 50 58 54Q54 56 50 55Q46 56 42 54Z" fill={c} />;
    case "beard":
      return <path d="M30 48Q30 72 50 72Q70 72 70 48Q66 62 58 62Q54 60 50 61Q46 60 42 62Q34 62 30 48Z" fill={c} />;
  }
}

function glasses(f: FaceAvatar): ReactNode {
  switch (f.glasses) {
    case "none":
      return null;
    case "round":
      return (
        <g fill="none" stroke={INK} strokeWidth="1.8">
          <circle cx="42" cy="46" r="6" />
          <circle cx="58" cy="46" r="6" />
          <path d="M48 46H52" />
        </g>
      );
    case "square":
      return (
        <g fill="none" stroke={INK} strokeWidth="1.8">
          <rect x="35" y="41" width="13" height="10" rx="2" />
          <rect x="52" y="41" width="13" height="10" rx="2" />
          <path d="M48 45H52" />
        </g>
      );
    case "shades":
      return (
        <g fill={INK} stroke={INK} strokeWidth="1.5">
          <path d="M34 42H48V47Q48 52 42 52Q35 52 34 47Z" />
          <path d="M52 42H66V47Q65 52 58 52Q52 52 52 47Z" />
          <path d="M48 43H52" />
        </g>
      );
  }
}

function Face({ f }: { f: FaceAvatar }) {
  return (
    <>
      {hairBack(f)}
      {/* The race suit: shoulders in the team colour, a white collar band and a zip. */}
      <path d="M14 100C14 82 30 74 50 74C70 74 86 82 86 100Z" fill={f.collar} />
      <rect x="43" y="62" width="14" height="14" fill={f.skin} />
      <path d="M38 76Q50 84 62 76" fill="none" stroke="#f5f5f5" strokeWidth="3" />
      <path d="M50 81V100" stroke={INK} strokeOpacity="0.5" strokeWidth="1.5" />
      <g fill={f.skin}>
        <circle cx="28" cy="48" r="4" />
        <circle cx="72" cy="48" r="4" />
        {HEAD[f.face]}
      </g>
      {hairFront(f)}
      {facialHair(f)}
      <path d={BROW_PATH[f.brows]} fill="none" stroke={f.hair === "none" ? INK : f.hairColour} strokeWidth="2.2" strokeLinecap="round" />
      {eyes(f)}
      {MOUTH[f.mouth]}
      {glasses(f)}
    </>
  );
}

/** A built avatar as an inline SVG disc. Decorative: the name beside it says who it is. */
export function AvatarSvg({ avatar, size = 40, className = "" }: { avatar: AvatarConfig; size?: number; className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className={`block shrink-0 rounded-full ${className}`}>
      <clipPath id={`${id}-disc`}>
        <circle cx="50" cy="50" r="50" />
      </clipPath>
      <g clipPath={`url(#${id}-disc)`}>
        <rect width="100" height="100" fill={DISC} />
        {avatar.style === "helmet" ? <Helmet h={avatar} clipId={`${id}-shell`} /> : <Face f={avatar} />}
      </g>
    </svg>
  );
}
