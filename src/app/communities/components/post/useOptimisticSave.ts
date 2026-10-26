"use client";

import { useState } from "react";

/** Keeps the bookmark responsive while the server persists the viewer's save. */
export function useOptimisticSave(url: string, initialSaved: boolean) {
  const [saved, setSaved] = useState(initialSaved);
  const [saving, setSaving] = useState(false);

  async function toggle(): Promise<boolean | null> {
    if (saving) return null;
    const next = !saved;
    setSaved(next);
    setSaving(true);
    const res = await fetch(url, { method: next ? "POST" : "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setSaved(!next);
      setSaving(false);
      return null;
    }
    setSaving(false);
    return next;
  }

  return { saved, saving, toggle };
}
