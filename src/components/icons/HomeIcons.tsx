// Small, dependency-free icon set for the homepage - no icon library is installed (checked
// package.json before adding one), and a handful of 24x24 stroke SVGs is less weight than pulling
// one in for ~10 glyphs. Feather-style (fill="none", stroke="currentColor") so color/size follow
// the surrounding text via `className`, same convention TreasureMapSection's own hand-drawn SVGs
// already use in this codebase.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function BrainIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-1 5.8V15a3 3 0 0 0 3 3h1" />
      <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 1 5.8V15a3 3 0 0 1-3 3h-1" />
      <path d="M9 4v16M15 4v16" />
    </svg>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 5.2a3.2 3.2 0 0 1 0 6.2" />
      <path d="M15 14.2c2.9.4 5 2.5 5.5 5.8" />
    </svg>
  );
}

export function TrophyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 4h8v4a4 4 0 0 1-8 0Z" />
      <path d="M8 5H5.5A1.5 1.5 0 0 0 4 6.5C4 8.5 5.5 10 8 10" />
      <path d="M16 5h2.5A1.5 1.5 0 0 1 20 6.5c0 2-1.5 3.5-4 3.5" />
      <path d="M12 12v3M9 20h6M10 17h4l.5 3h-5Z" />
    </svg>
  );
}

export function ConstructorIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 20V10l6-4 6 4v10" />
      <path d="M9 20v-6h4v6" />
      <path d="M15 20V8l6 3v9" />
    </svg>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </svg>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5l2.4 5.1 5.6.6-4.2 3.8 1.2 5.5L12 15.8 6.9 18.5l1.2-5.5-4.1-3.8 5.5-.6Z" />
    </svg>
  );
}

export function WrenchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14.5 6.5a4 4 0 0 1-5.4 5.4L4 17l3 3 5.1-5.1a4 4 0 0 1 5.4-5.4l-2.6 2.6-2-2Z" />
    </svg>
  );
}

export function ConfettiIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 19l2-6 6 2-2 6Z" />
      <path d="M14 5l1.5 1.5M18 9l1.5 1.5M17 4.5l.01.01M9 21l.01.01" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2.4} {...props}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2.2} {...props}>
      <path d="M4 12h16M13 5l7 7-7 7" />
    </svg>
  );
}
