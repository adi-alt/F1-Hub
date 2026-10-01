"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";

/** Chips as filter toggles, with removable tags. */
export function ChipDemo() {
  const [selected, setSelected] = useState<string[]>(["Ferrari"]);
  const [tags, setTags] = useState(["Strategy", "Rookies", "Wet races"]);
  const toggle = (label: string) => setSelected((s) => (s.includes(label) ? s.filter((x) => x !== label) : [...s, label]));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {["Ferrari", "McLaren", "Mercedes", "Red Bull Racing"].map((team) => (
          <Chip key={team} selected={selected.includes(team)} onClick={() => toggle(team)}>
            {team}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Chip key={tag} onRemove={() => setTags((t) => t.filter((x) => x !== tag))}>
            {tag}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** A primary action that goes busy for two seconds when pressed. */
export function LoadingButtonDemo() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="primary"
      size="md"
      iconStart={Send}
      loading={busy}
      onClick={() => {
        setBusy(true);
        setTimeout(() => setBusy(false), 2000);
      }}
    >
      Post prediction
    </Button>
  );
}
