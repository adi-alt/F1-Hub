"use client";

import { Sparkles, Users } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Icon } from "@/components/ui/Icon";
import { RollingNumber } from "@/components/ui/RollingNumber";
import type { CrowdVsModel } from "@/lib/supabase/communityWeekend";
import { EYEBROW } from "./panel";

/**
 * Your communities against the Apex model, this season: over every settled round where a community had a crowd and
 * the model had a pick, how many each called right, overall and per community (the community furthest ahead of the
 * model first). It's the section's standing rivalry: the people who follow the sport against the machine that
 * models it. The footnote says the model's race picks are made after qualifying (pole's before), while the crowd
 * locks in before qualifying.
 */
export function CrowdVsApexWidget({ record, heading = true }: { record: CrowdVsModel; /** Off inside a dialog, which titles it. */ heading?: boolean }) {
  const { crowd, model, rounds } = record.overall;
  const crowdShare = crowd + model > 0 ? crowd / (crowd + model) : 0.5;
  return (
    <section aria-labelledby="crowd-vs-apex">
      {heading ? (
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="crowd-vs-apex" className={EYEBROW}>
            Crowd vs Apex
          </h3>
          <span className="text-caption tabular text-tertiary">{record.season}</span>
        </div>
      ) : (
        <p id="crowd-vs-apex" className="text-caption text-secondary">
          Every settled round this season where a community had a crowd pick (three or more entries) and the Apex model had one: who called it.
        </p>
      )}

      {rounds === 0 ? (
        <p className="mt-2 text-caption text-secondary">Once a round is settled, your communities&apos; pick is scored against the Apex model&apos;s here.</p>
      ) : (
        <>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-1 text-caption text-secondary">
                <Icon icon={Users} size={16} className="size-3.5" />
                Your communities
              </p>
              <p className="text-title-md font-semibold tabular text-primary">
                <RollingNumber value={crowd} />
              </p>
            </div>
            <p className="pb-1 text-caption tabular text-tertiary">of {rounds} rounds</p>
            <div className="text-right">
              <p className="flex items-center justify-end gap-1 text-caption text-secondary">
                Apex
                <Icon icon={Sparkles} size={16} className="size-3.5" />
              </p>
              <p className="text-title-md font-semibold tabular text-primary">
                <RollingNumber value={model} />
              </p>
            </div>
          </div>
          {/* The split, drawn: who has called more of the rounds both had a pick for. */}
          <div aria-hidden className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <span className="h-full bg-success transition-[width] duration-slow ease-standard" style={{ width: `${crowdShare * 100}%` }} />
            <span className="h-full flex-1 bg-info/70" />
          </div>
          {record.byCommunity.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {record.byCommunity.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-caption">
                  <EntityAvatar imageUrl={c.avatarUrl} name={c.name} seed={c.id} size={16} />
                  <span className="min-w-0 flex-1 truncate text-secondary">{c.name}</span>
                  <span className={`shrink-0 tabular ${c.crowd > c.model ? "font-semibold text-success" : c.crowd < c.model ? "text-secondary" : "text-tertiary"}`}>
                    {c.crowd}–{c.model}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-caption text-tertiary">Apex&apos;s race picks come after qualifying; your communities lock in before it.</p>
        </>
      )}
    </section>
  );
}
