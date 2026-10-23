import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AvatarSvg } from "@/components/avatar/AvatarSvg";
import * as A from "@/lib/avatar";
import { preferencesPatchSchema } from "@/lib/inputLimits";

const helmet: A.HelmetAvatar = { style: "helmet", shape: "aero", base: "#e10600", accent1: "#f5f5f5", accent2: "#1c1c22", pattern: "twin", visor: "#d4a017", number: 44 };
const face: A.FaceAvatar = { style: "face", face: "oval", skin: "#8d5524", hair: "curly", hairColour: "#1b1b1b", eyes: "happy", brows: "raised", mouth: "grin", facialHair: "beard", glasses: "round", collar: "#3671c6" };

test("valid helmet and face configs are accepted", () => {
  assert.deepEqual(A.avatarSchema.parse(helmet), helmet);
  assert.deepEqual(A.avatarSchema.parse(face), face);
  assert.equal(preferencesPatchSchema.safeParse({ avatar: face }).success, true);
});

test("unknown ids, colours, styles, extra keys and out-of-range numbers are rejected", () => {
  const bad: unknown[] = [
    { ...helmet, pattern: "skulls" },
    { ...helmet, base: "#123456" },
    { ...helmet, base: "red" },
    { ...helmet, number: 100 },
    { ...helmet, number: -1 },
    { ...helmet, number: 7.5 },
    { ...face, skin: "#000000" },
    { ...face, hair: "afro-xl" },
    { ...face, collar: "javascript:alert(1)" },
    { ...face, extra: "x" },
    { ...face, style: "robot" },
    { ...helmet, style: "face" },
    "helmet",
    null,
  ];
  for (const value of bad) {
    assert.equal(A.avatarSchema.safeParse(value).success, false, JSON.stringify(value));
    assert.equal(A.parseAvatar(value), null);
  }
  assert.equal(preferencesPatchSchema.safeParse({ avatar: { ...helmet, number: 120 } }).success, false);
});

test("the default avatar is deterministic per id and always valid", () => {
  assert.deepEqual(A.defaultAvatar("user-1"), A.defaultAvatar("user-1"));
  assert.deepEqual(A.defaultAvatar("user-1", "face"), A.defaultAvatar("user-1", "face"));
  const ids = Array.from({ length: 50 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
  const distinct = new Set(ids.map((id) => JSON.stringify(A.defaultAvatar(id))));
  assert.ok(distinct.size > 40, `only ${distinct.size} distinct defaults for 50 ids`);
  for (const id of ids) {
    assert.ok(A.avatarSchema.safeParse(A.defaultAvatar(id)).success);
    assert.ok(A.avatarSchema.safeParse(A.defaultAvatar(id, "face")).success);
  }
});

test("every option renders as an SVG", () => {
  const render = (avatar: A.AvatarConfig) => {
    const html = renderToStaticMarkup(createElement(AvatarSvg, { avatar }));
    assert.match(html, /^<svg[\s\S]*<\/svg>$/);
    return html;
  };
  const vary = <T extends A.AvatarConfig, K extends keyof T>(base: T, key: K, values: readonly T[K][]) => values.forEach((v) => render({ ...base, [key]: v }));
  vary(helmet, "shape", A.HELMET_SHAPES);
  vary(helmet, "pattern", A.HELMET_PATTERNS);
  vary(helmet, "base", A.PALETTE);
  vary(helmet, "visor", A.VISORS);
  vary(helmet, "number", [0, 7, 99]);
  vary(face, "face", A.FACE_SHAPES);
  vary(face, "skin", A.SKIN_TONES);
  vary(face, "hair", A.HAIR_STYLES);
  vary(face, "hairColour", A.HAIR_COLOURS);
  vary(face, "eyes", A.EYES);
  vary(face, "brows", A.BROWS);
  vary(face, "mouth", A.MOUTHS);
  vary(face, "facialHair", A.FACIAL_HAIR);
  vary(face, "glasses", A.GLASSES);
  vary(face, "collar", A.PALETTE);
  assert.match(render({ ...helmet, number: 81 }), />81</);
});
