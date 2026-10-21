"use client";

import { useState } from "react";
import { Bell, Mail } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { EYEBROW, PANEL } from "@/components/ui/panel";
import { useViewerTimeZone } from "@/hooks/useViewerTimeZone";
import { formatLocalDateTime } from "@/lib/countdown";
import { channelsFor, NOTIFICATION_KINDS, type Channel, type NotificationKind, type NotificationPrefs } from "@/lib/notificationKinds";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${checked ? "bg-brand" : "bg-white/10"}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-[left] duration-fast ${checked ? "left-5" : "left-0.5"}`} />
    </button>
  );
}

const GROUPS = ["Predictions", "Conversations", "Your communities"] as const;

/**
 * How Apex F1 Hub tells you things: for each kind of event, on the site (the bell in the header) and/or by email,
 * saved as each switch is flipped and put back if the save fails. Then the race-weekend reminder emails, and where
 * everything is delivered. Moderator-only kinds are marked, so nobody wonders why they never arrive.
 */
export function NotificationsForm({
  initialPrefs,
  initialNotifyBeforeQualifying,
  initialNotifyOnResults,
  email,
  moderates,
  nextQualifying,
}: {
  initialPrefs: NotificationPrefs;
  initialNotifyBeforeQualifying?: boolean;
  initialNotifyOnResults?: boolean;
  email: string | null;
  /** How many communities the person admins or moderates. */
  moderates: number;
  nextQualifying: { raceName: string; startsAt: string } | null;
}) {
  const tz = useViewerTimeZone();
  const [prefs, setPrefs] = useState<NotificationPrefs>(initialPrefs);
  const [reminders, setReminders] = useState({ notifyBeforeQualifying: !!initialNotifyBeforeQualifying, notifyOnResults: !!initialNotifyOnResults });
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  async function setChannel(kind: NotificationKind, channel: Channel, value: boolean) {
    const before = prefs;
    setPrefs({ ...prefs, [kind]: { ...channelsFor(prefs, kind), [channel]: value } });
    setStatus("saving");
    const res = await fetch("/api/notifications/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [kind]: { [channel]: value } }) }).catch(() => null);
    if (!res?.ok) {
      setPrefs(before);
      setStatus("error");
      return;
    }
    setStatus("idle");
  }

  async function setReminder(key: keyof typeof reminders, value: boolean) {
    setReminders((r) => ({ ...r, [key]: value }));
    setStatus("saving");
    const res = await fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: value }) }).catch(() => null);
    if (!res?.ok) {
      setReminders((r) => ({ ...r, [key]: !value }));
      setStatus("error");
      return;
    }
    setStatus("idle");
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <section aria-labelledby="notify-events" className={PANEL}>
          <div className="flex items-end justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
            <h2 id="notify-events" className={EYEBROW}>
              What happens
            </h2>
            <div className="flex shrink-0 gap-5 text-caption text-tertiary" aria-hidden>
              <span className="flex w-11 flex-col items-center gap-0.5">
                <Icon icon={Bell} size={16} className="size-3.5" />
                On site
              </span>
              <span className="flex w-11 flex-col items-center gap-0.5">
                <Icon icon={Mail} size={16} className="size-3.5" />
                Email
              </span>
            </div>
          </div>
          {GROUPS.map((group) => (
            <div key={group}>
              <p className="px-5 pb-1 pt-4 text-caption font-semibold text-secondary">{group}</p>
              <ul className="divide-y divide-white/[0.05]">
                {NOTIFICATION_KINDS.filter((k) => k.group === group).map((k) => {
                  const ch = channelsFor(prefs, k.kind);
                  return (
                    <li key={k.kind} className="flex items-center justify-between gap-4 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-body-sm font-medium text-primary">{k.label}</p>
                        <p className="mt-0.5 text-caption text-tertiary">
                          {k.description}
                          {k.moderatorsOnly && moderates === 0 && " Only if you moderate a community."}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-5">
                        <Toggle checked={ch.site} onChange={(v) => void setChannel(k.kind, "site", v)} label={`${k.label}: on the site`} />
                        {k.siteOnly ? (
                          <span className="w-11 text-center text-caption text-tertiary" title="Always emailed">Always</span>
                        ) : (
                          <Toggle checked={ch.email} onChange={(v) => void setChannel(k.kind, "email", v)} label={`${k.label}: by email`} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>

        <section aria-labelledby="notify-weekend" className={PANEL}>
          <h2 id="notify-weekend" className={`border-b border-white/[0.06] px-5 py-3 ${EYEBROW}`}>
            Race weekend emails
          </h2>
          <ul className="divide-y divide-white/[0.05]">
            {[
              { key: "notifyBeforeQualifying" as const, title: "Before qualifying locks", body: "A heads-up while picks and prediction rounds are still open." },
              { key: "notifyOnResults" as const, title: "When results land", body: "How your picks did, once a race you picked for is over." },
            ].map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-primary">{r.title}</p>
                  <p className="mt-0.5 text-caption text-tertiary">{r.body}</p>
                </div>
                <Toggle checked={reminders[r.key]} onChange={(v) => void setReminder(r.key, v)} label={`${r.title} email`} />
              </li>
            ))}
          </ul>
          <p className="border-t border-white/[0.06] px-5 py-3 text-caption text-tertiary">Your choice is saved now; these two reminders start once scheduled sending is switched on.</p>
        </section>
        <p aria-live="polite" className="min-h-4 text-caption">
          {status === "error" ? <span className="text-danger">Couldn&apos;t save that change. Try again.</span> : status === "saving" ? <span className="text-tertiary">Saving…</span> : null}
        </p>
      </div>

      <div className="space-y-6">
        <section aria-labelledby="notify-delivery" className={`p-5 ${PANEL}`}>
          <h2 id="notify-delivery" className={EYEBROW}>
            Where they go
          </h2>
          <dl className="mt-3 space-y-3">
            <div>
              <dt className="flex items-center gap-1.5 text-caption text-tertiary">
                <Icon icon={Bell} size={16} className="size-3.5" />
                On the site
              </dt>
              <dd className="mt-0.5 text-body-sm text-primary">The bell at the top of every page</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-caption text-tertiary">
                <Icon icon={Mail} size={16} className="size-3.5" />
                Email
              </dt>
              <dd className="mt-0.5 truncate text-body-sm text-primary">{email ?? "No email on your account"}</dd>
            </div>
            <div>
              <dt className="text-caption text-tertiary">Times shown in</dt>
              <dd suppressHydrationWarning className="mt-0.5 text-body-sm text-primary">
                {tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
              </dd>
            </div>
          </dl>
        </section>

        {nextQualifying && (
          <section aria-labelledby="notify-next" className={`p-5 ${PANEL}`}>
            <h2 id="notify-next" className={EYEBROW}>
              Next lock
            </h2>
            <p className="mt-3 text-body-sm font-medium text-primary">{nextQualifying.raceName}</p>
            <p suppressHydrationWarning className="mt-0.5 text-caption text-secondary">
              Qualifying starts {formatLocalDateTime(nextQualifying.startsAt, tz ?? undefined)}
            </p>
            <p className="mt-2 text-caption text-tertiary">Picks and prediction rounds for this race close then.</p>
          </section>
        )}

        {moderates > 0 && (
          <section aria-labelledby="notify-mod" className={`p-5 ${PANEL}`}>
            <h2 id="notify-mod" className={EYEBROW}>
              As a moderator
            </h2>
            <p className="mt-3 text-body-sm text-secondary">
              You run {moderates} {moderates === 1 ? "community" : "communities"}: join requests and posts waiting for approval come to you and the other moderators.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
