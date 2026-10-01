import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Bell, Flag, Plus, Search, Trash2, Trophy } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Badge, StateLabel, STATE_BADGES, type DomainState } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProvenanceLine } from "@/components/ui/ProvenanceLine";
import { Section } from "@/components/ui/Section";
import { Surface } from "@/components/ui/Surface";
import { ChipDemo, LoadingButtonDemo } from "./InteractiveDemos";

export const metadata: Metadata = { title: "UI primitives", robots: { index: false, follow: false } };

/** Served locally and on Vercel preview deployments, never on the production deployment. */
function isPreviewEnvironment(): boolean {
  return process.env.VERCEL_ENV ? process.env.VERCEL_ENV !== "production" : process.env.NODE_ENV !== "production";
}

const VARIANTS = ["primary", "secondary", "ghost", "danger"] as const;
const SIZES = ["sm", "md", "lg"] as const;

/**
 * Every design-system primitive and state in one place (design system spec §12.5). It doubles as the
 * primitives' documentation, and is what the visual-regression snapshots will be taken from.
 */
export default function UiPreviewPage() {
  if (!isPreviewEnvironment()) notFound();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-8 text-primary">
      <PageHeader
        eyebrow="Design system"
        title="UI primitives"
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Dev" }, { label: "UI primitives" }]}
        meta="Every primitive in src/components/ui, in each variant and state."
      />

      <Section id="buttons" title="Button" level={2} description="One primary per view region; secondary beside it; ghost for quiet actions; danger for destructive confirmations only.">
        <div className="flex flex-col gap-4">
          {SIZES.map((size) => (
            <div key={size} className="flex flex-wrap items-center gap-3">
              {VARIANTS.map((variant) => (
                <Button key={variant} variant={variant} size={size}>
                  {variant === "danger" ? "Delete community" : variant === "primary" ? "Enter prediction" : variant === "secondary" ? "View results" : "Cancel"}
                </Button>
              ))}
              <Button variant="secondary" size={size} iconOnly iconStart={Bell} aria-label="Notifications" />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="md" iconStart={Plus}>
              New post
            </Button>
            <Button variant="ghost" size="md" iconEnd={ArrowRight}>
              See all
            </Button>
            <Button variant="primary" size="md" disabled>
              Locked
            </Button>
            <Button variant="secondary" size="md" disabled>
              Unavailable
            </Button>
            <Button variant="danger" size="md" iconStart={Trash2} loading>
              Removing
            </Button>
            <LoadingButtonDemo />
            <Button variant="secondary" size="md" asChild>
              <Link href="/season">Season (a link)</Link>
            </Button>
          </div>
        </div>
      </Section>

      <Section id="badges" title="Badge and StateLabel" level={2} description="Badges carry status; at most one per item. StateLabel gives each domain state one look, always with an icon or dot.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">Neutral</Badge>
            <Badge tone="info">Info</Badge>
            <Badge tone="success" icon={Trophy}>
              Correct
            </Badge>
            <Badge tone="warning">Closing soon</Badge>
            <Badge tone="danger">Failed</Badge>
            <Badge tone="live">Live</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {(Object.keys(STATE_BADGES) as DomainState[]).map((state) => (
              <span key={state} className="inline-flex items-center gap-2 text-body-sm text-secondary">
                <span className="text-tertiary">{state}:</span>
                {STATE_BADGES[state] ? <StateLabel state={state} /> : <span className="text-tertiary">(nothing)</span>}
              </span>
            ))}
          </div>
        </div>
      </Section>

      <Section id="chips" title="Chip" level={2} description="Filters and tags: outlined and round, never status.">
        <ChipDemo />
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip>Plain tag</Chip>
        </div>
      </Section>

      <Section id="icons" title="Icon" level={2} description="lucide-react at stroke 1.75, in 16, 20 and 24px.">
        <div className="flex items-center gap-4 text-secondary">
          <Icon icon={Flag} size={16} />
          <Icon icon={Flag} size={20} />
          <Icon icon={Flag} size={24} label="Chequered flag" />
        </div>
      </Section>

      <Section id="surfaces" title="Surface" level={2} description="Tone, not borders, separates regions; a Surface only contains higher levels.">
        <div className="grid gap-4 md:grid-cols-3">
          <Surface level={1}>
            <p className="text-body-sm text-secondary">Level 1: data regions.</p>
            <Surface level={2} padding="sm" className="mt-3">
              <p className="text-body-sm text-secondary">Level 2: raised.</p>
              <Surface level={3} padding="sm" className="mt-3">
                <p className="text-body-sm text-secondary">Level 3: dialogs.</p>
              </Surface>
            </Surface>
          </Surface>
          <Surface level={1} interactive href="/season" linkLabel="Season standings">
            <p className="text-title-md">Season standings</p>
            <p className="mt-1 text-body-sm text-secondary">The whole card is one link; the button inside still works on its own.</p>
            <Button variant="ghost" size="sm" className="mt-3" iconStart={Bell}>
              Follow
            </Button>
          </Surface>
          <Surface level={1} padding="sm">
            <p className="text-body-sm text-secondary">Compact padding (16px).</p>
          </Surface>
        </div>
      </Section>

      <Section
        id="sections"
        title="Section"
        level={2}
        description="A real h2 or h3, an optional description, actions on the right and a provenance line."
        actions={
          <Button variant="ghost" size="sm" iconStart={Search}>
            Filter
          </Button>
        }
        provenance={{ source: "Official classification", status: "Final", updated: "17:42" }}
      >
        <Section id="sections-nested" title="A level-3 sub-section" level={3} description="Sub-sections use title-md.">
          <ProvenanceLine source="OpenF1" status="Preliminary" updated="15:05" />
        </Section>
      </Section>

      <Section id="alerts" title="Alert" level={2} description="Danger uses the coral danger tone with an icon, never brand red.">
        <div className="flex flex-col gap-3">
          <Alert tone="info" title="Qualifying starts at 08:00 UTC">
            Predictions lock when qualifying begins.
          </Alert>
          <Alert tone="success" title="Prediction saved" />
          <Alert tone="warning" title="Preliminary result">
            Official classification usually follows on Monday.
          </Alert>
          <Alert
            tone="danger"
            title="Couldn't load the standings"
            action={
              <Button variant="secondary" size="sm">
                Try again
              </Button>
            }
          >
            Check your connection and try again.
          </Alert>
        </div>
      </Section>

      <Section id="empty-states" title="EmptyState" level={2} description="Unboxed by default; boxed only for top-level empty pages.">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState icon={Trophy} message="No predictions yet this season." />
          <EmptyState
            boxed
            icon={Flag}
            message="You haven't joined a community yet."
            action={
              <Button variant="primary" size="md">
                Find a community
              </Button>
            }
          />
        </div>
      </Section>
    </main>
  );
}
