# Design System Specification: Apex F1 Hub

Status: **proposal** (audit phase; nothing implemented). Date: 2026-09-28.

This is the target system the redesign backlog implements. Every contrast ratio in this document was computed with the WCAG 2.x relative-luminance formula; the script is in the audit scratchpad and the method is in [AUDIT_COVERAGE.md](AUDIT_COVERAGE.md). Principles P1-P20 are in [DESIGN_BENCHMARKS.md §9](DESIGN_BENCHMARKS.md).

---

## 1. Visual character

**"Pit-wall calm."** A motorsport data product should feel like the timing screens on a pit wall: dark, dense, exact and calm, with colour spent only where something is happening. The drama belongs to the sport (photography, real faces, real track shapes, live moments), not to the chrome.

Design principles, in priority order:
1. **Answer first.** Every page and module leads with the fact the user came for (the next session, the result, the probability, their score).
2. **Spend colour on meaning.** Neutral chrome. F1 red is the brand mark, the primary action and the live state. Team colours identify teams. Semantic colours report status. Nothing is coloured for decoration.
3. **Hierarchy through type and space, not boxes.** At most one container level inside a section.
4. **Tables for comparison, cards for browsing** (P1).
5. **One state, clearly.** Each item has exactly one state indicator, drawn from a defined state machine.
6. **Honest data.** Provenance, freshness and "preliminary / AI-generated / back-filled" labels are part of the design, not footnotes.
7. **Accessible by default.** It passes WCAG 2.2 AA on every surface, works with the keyboard, and respects reduced motion.

**Preserved from today:** the near-black canvas, F1 red `#e10600`, Geist Sans and Mono, `EntityAvatar` headshots, `circuitShapes.json` track paths, the team-colour data, and the editorial copy voice.

**Removed:** random ambient blur streaks, the grain overlay, glass cards, per-card backdrop blur, uppercase tracked eyebrows as headings, gradient accents, the page-transition template, and feed staggers.

---

## 2. Tokens

All tokens are CSS custom properties in `globals.css`, registered in Tailwind v4 `@theme` so they are used as utilities (`bg-surface-1`, `text-secondary`, `border-subtle`). **Arbitrary `[var(--x)]` and `text-[Npx]` classes are banned by lint** (see §12).

### 2.1 Colour: neutrals and surfaces

| Token | Value | Use |
|---|---|---|
| `--surface-0` | `#09090b` | Page canvas (the current background, kept) |
| `--surface-1` | `#16161a` | Data regions: tables, charts, prediction cards, rails |
| `--surface-2` | `#212126` | Raised: popovers, menus, inputs on surface-1, hover rows |
| `--surface-3` | `#2c2c32` | Dialogs, sheets, toasts |
| `--surface-inverse` | `#f4f4f5` | Rare: tooltips on charts |
| `--border-subtle` | `#303037` | Decorative separators and table hairlines (not a control boundary) |
| `--border-strong` | `#72727d` | Input and select boundaries and outline buttons on surfaces 0-2 (≥3.37:1) |
| `--border-strong-raised` | `#84848f` | The same on surface-3 (3.75:1) |
| `--text-primary` | `#f4f4f5` | Headings, primary values |
| `--text-secondary` | `#a9a9b2` | Body-secondary, metadata |
| `--text-tertiary` | `#9a9aa4` | Captions, timestamps (still AA) |
| `--text-disabled` | `#5c5c66` | Disabled only (exempt from contrast rules) |

Surface steps: 1.10 / 1.13 / 1.16:1, compared with today's 1.06:1. Raised surfaces are lighter, never translucent (P6). Surfaces are distinguishable by tone, so borders are no longer needed to make a region exist.

**Text contrast (computed):**

| Text | on s0 | on s1 | on s2 | on s3 |
|---|---|---|---|---|
| text-primary | 18.10 | 16.42 | 14.58 | 12.62 |
| text-secondary | 8.53 | 7.74 | 6.87 | 5.95 |
| text-tertiary | 7.14 | 6.47 | 5.75 | 4.98 |

Compare today's `neutral-500` at 3.22-4.20, which fails.

### 2.2 Colour: brand, semantic, focus

| Token | Value | Allowed use | Contrast |
|---|---|---|---|
| `--brand` | `#e10600` | **Fills only:** primary button background, live dot, active-nav underline, brand mark, the "Next" round marker. **Never** body or metadata text. | white on brand 4.97:1 |
| `--brand-hover` | `#c80500` | Primary button hover (darken, don't brighten; brightening would drop the contrast to about 4.2) | white 6.04:1 |
| `--brand-text` | `#ff5c52` | Red text when it must be red (e.g. "Live" label text) | 5.93 on s1 |
| `--danger` | `#ff6b63` | Error text and icons, destructive button text. Always paired with an icon. | 6.47 on s1 |
| `--danger-fill` | `#b3261e` | Destructive primary button | white 6.54:1 |
| `--danger-subtle` | `rgb(255 107 99 / 0.10)` | Alert background | — |
| `--success` | `#3fcf8e` | Correct, positive delta, success toast | 9.05 on s1 |
| `--warning` | `#f2b53a` | Closing soon, preliminary data, degraded | 9.84 on s1 |
| `--info` | `#6aa9ff` | Neutral informational notices, AI-generated label icon | 7.50 on s1 |
| `--focus-ring` | `#f4f4f5` | 2px outline plus a 2px offset on every focusable element | 16.4:1 |

**Red grammar (P8).** An item may carry **at most one** red element. Error states use `--danger` (a warmer coral with an icon), never `--brand`. The "Resolved" status is never red.

### 2.3 Team colours

`src/lib/teamColors.ts` stays the data source. Rules:
- Team colour appears as a **3px vertical bar** beside the team or driver identity, a **dot** in legends and chips, or a **line** in charts. It is never a card tint, gradient or background panel.
- Always pair it with the code or name (P14).
- Chart lines use team colour only for the 2-3 highlighted entities; everything else is `--text-tertiary` at 40% (P13).
- Contrast of current team colours against `surface-1`: Red Bull `#3671c6` 3.72:1 and Ferrari `#e8002d` 3.84:1 pass 3:1 for non-text; all current teams pass. Historical colours can be too dark (e.g. Tyrrell `#002d62`), so add `ensureVisible(color, surface)`, which lightens a colour in OKLCH until it reaches 3:1.
- Similar hues (Red Bull, Alpine and RB blues; Ferrari and Alfa reds) get line-dash or marker variants whenever they appear in the same chart.

### 2.4 Typography

Font: **Geist Sans** for UI; **Geist Mono** only for timing data where fixed width helps (lap times in dense tables, countdowns). The `body` fallback in `globals.css:47` currently says Arial; fix it to the Geist variable.

Every numeric context uses `font-variant-numeric: tabular-nums` (utility `tabular`).

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `display-lg` | 40 / 44 | 700, tracking −0.02em | Race or entity name in heroes |
| `display-md` | 30 / 36 | 700, −0.015em | Page `h1` |
| `title-lg` | 22 / 28 | 600 | Section `h2` |
| `title-md` | 18 / 24 | 600 | Sub-section `h3`, card question |
| `body` | 16 / 24 | 400 | Post body, descriptions |
| `body-sm` | 14 / 20 | 400 / 500 | Default UI text, table cells, metadata |
| `caption` | 12 / 16 | 500 | Table column headers (the **only** uppercase tier: `tracking-[0.04em]`), timestamps, chart axes |

- **Nothing below 12px.** This replaces the 21 arbitrary sizes.
- **At most 3 sizes per component** (P4).
- Sentence case everywhere except table column headers (P20).
- Eyebrows are allowed only as a single optional `caption` line in `text-secondary`, sentence case, above a `display-*` heading in a hero ("Round 16 · Sakhir").

### 2.5 Spacing (4px base)

| Token | px | Use |
|---|---|---|
| `space-1` | 4 | icon-to-label |
| `space-2` | 8 | inside compact controls |
| `space-3` | 12 | between related lines |
| `space-4` | 16 | card padding (compact), gutters on mobile |
| `space-5` | 20 | card padding (default), list row padding |
| `space-6` | 24 | between groups inside a section |
| `space-8` | 32 | between sections on mobile |
| `space-12` | 48 | between sections on desktop |
| `space-16` | 64 | hero padding |

Rule: proximity groups, and space separates sections. Use a `divider` hairline only between repeated list items or inside tables.

### 2.6 Radius, elevation, z-index, motion

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 6px | badges, chips, inputs, small buttons |
| `radius-md` | 10px | cards, popovers, buttons |
| `radius-lg` | 16px | dialogs, sheets, hero media |
| `radius-full` | 9999px | avatars, the live dot, toggles |
| elevation | tone only (surface-0…3). One shadow token, `shadow-overlay: 0 12px 32px rgb(0 0 0 / 0.5)`, for dialogs and popovers only | — |
| z-index | `z-base 0 · z-sticky 10 · z-header 20 · z-popover 30 · z-dialog 40 · z-toast 50` | Replaces 90 / 95 / 100 / 120 / 200 / 300 / 400 |
| motion | `duration-fast 120ms` (hover, press) · `duration-base 200ms` (popover, tab indicator) · `duration-slow 320ms` (dialog, sheet); easing `cubic-bezier(0.2, 0, 0, 1)` | Replaces 19 durations |

**Motion rules (P17):**
- Animate `opacity` and `transform` only. No `height: auto` or `layout` animation in feeds or tables.
- No page-transition template and no stagger on lists.
- Everything is wrapped in reduced-motion handling: framer-motion `MotionConfig reducedMotion="user"` is already in place. Add the CSS `@media (prefers-reduced-motion: reduce)` to disable shimmer, pulse, backdrop crossfades and hover scales.
- Countdown digits don't animate.

---

## 3. Layout system

| Token | Value |
|---|---|
| Breakpoints | `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536` (Tailwind defaults, kept) |
| Containers | `container-content` max 1200px; `container-wide` max 1440px; gutters 16px (<md), 24px (md-xl), 32px (≥xl) |
| Header | Always `container-wide` |
| Grid | 12 columns at ≥lg with a 24px gap |
| Rail | A single token `--rail-width: 320px`, shown at ≥lg (race) or ≥xl (communities). Below that, rail content re-enters the main flow at a defined position. |
| Main + rail | `grid-cols-[minmax(0,1fr)_var(--rail-width)]` |
| Groups | `[240px_minmax(0,1fr)_var(--rail-width)]` at ≥xl; `[240px_minmax(0,1fr)]` at lg; single column below |

**Page template (every route):**
```
<Header/>                                      (container-wide, sticky, z-header, surface-0 at 92% + 8px blur: the ONE allowed glass layer)
<main id="main">                               (single landmark)
  <PageHeader breadcrumb title meta state actions/>   (container: content | wide)
  <PageBody> sections separated by space-12 </PageBody>
</main>
<Footer/>                                      (on every page: provenance, links, non-affiliation)
```

- `scroll-padding-top` equals the header height, and `scroll-padding-bottom` equals the Apex launcher height (P18, WCAG 2.4.11).
- The document scrolls natively (no overflow-hidden body).
- Add `color-scheme: dark` on `:root`.

**Responsive rules:**
- Phone: single column. The **phase-critical fact** (countdown, winner, your score) sits in the page header, never at the bottom. Tables scroll horizontally with a visible scrollbar and a frozen first column. Touch targets are ≥44px for primary actions and ≥24px for everything else.
- Tablet: single column plus 2-up grids for browse cards. The rail stays in the flow.
- Desktop: main plus rail. The rail is sticky with `max-h: calc(100dvh - header - 32px)`, and the scrollbar stays visible.

---

## 4. Component contracts

These are the primitives to build in `src/components/ui/`. Each gets typed variants (no `className` style overrides beyond layout: margins, width, grid placement), a dev preview, and visual-regression snapshots.

### 4.1 Button
```ts
type ButtonProps = {
  variant: "primary" | "secondary" | "ghost" | "danger";
  size: "sm" | "md" | "lg";          // heights 32 / 40 / 48
  loading?: boolean;                  // keeps width, shows spinner + aria-busy, disables
  iconStart?: LucideIcon; iconEnd?: LucideIcon; iconOnly?: boolean; // iconOnly requires aria-label
  asChild?: boolean;                  // for Next <Link>
}
```

| Variant | Visual | When |
|---|---|---|
| primary | `bg-brand` white text; hover `brand-hover` | **One per view region** (P8): Enter prediction, Join, Sign up, Post |
| secondary | `surface-2` fill, `border-strong`, text-primary | Other actions next to a primary |
| ghost | no fill; `text-secondary`, turns primary on hover; hover fill `surface-2` | Toolbars, vote and comment actions, Change, Cancel |
| danger | `danger-fill` white text | Destructive confirmations only (Delete community, Remove member) |

States:
- hover: tone shift over `duration-fast`
- pressed: `scale(0.98)` (disabled under reduced motion)
- focus-visible: `--focus-ring`
- disabled: `text-disabled`, no pointer events, with a tooltip explaining why if not obvious
- loading: spinner and `aria-busy`

The minimum hit area is 24px, via padding for `sm`.

### 4.2 Badge (status) and Chip (category)
```ts
type BadgeProps = { tone: "neutral" | "info" | "success" | "warning" | "danger" | "live"; icon?: LucideIcon; children: string }  // 1-2 words
type StateLabelProps = { state: "open" | "locked" | "resolved" | "void" | "upcoming" | "live" | "preliminary" | "final" | "pending" }
type ChipProps = { selected?: boolean; onRemove?: () => void; children: string }  // user-facing categories/filters
```

- Badge: `caption`, sentence case, `radius-sm`, a subtle tinted background (tone at 12%) with tone text. Every tone meets ≥4.5:1 on s1.
- `StateLabel` maps each domain state to one Badge configuration, **with an icon**:
  - open → neutral (usually *not rendered*, P2)
  - locked → warning 🔒
  - resolved → neutral ✓
  - void → neutral ⊘
  - live → live, a red dot plus "Live"
  - preliminary → warning
  - final → no badge
- **At most one Badge per item** except role markers ("Mod"). Chips are filters and tags, visually distinct (outline, `radius-full`), and never carry status.

### 4.3 Surface and Card
```ts
type SurfaceProps = { level: 1 | 2 | 3; padding?: "none" | "sm" | "md"; interactive?: boolean; as?: "section" | "article" | "div" }
```
- No border by default. The tone separates it from the page.
- `interactive` adds a hover tone of `surface-2` and makes the whole card a focusable link (one link per card; nested actions are separate buttons).
- **Rule:** a Surface may not contain another Surface of the same or lower level. Lint for it in review; the visual-regression check will catch violations.

### 4.4 Section and SectionHeader
```ts
<Section id title="Results" level={2} description? actions? provenance?>…</Section>
```
- Renders a real `h2` or `h3` (`title-lg` / `title-md`), an optional description in `body-sm text-secondary`, actions on the right, and an optional provenance line ("Official classification · updated 17:42").
- Replaces RaceSectionCard, RaceSubSection and all 245 eyebrow labels.

### 4.5 Table
```ts
<Table columns={[{ key, header, align: "start"|"end", numeric?, sortable?, width? }]} rows stickyFirstColumn? density="compact"|"default" onRowActivate? expandable? />
```
- Headers in `caption` uppercase `text-secondary` (the one uppercase tier).
- Rows 36px (compact) or 44px (default), with a `border-subtle` hairline. No zebra striping except on wide matrices.
- Numeric cells are right-aligned `tabular`.
- Sortable headers are `<button>` elements with `aria-sort`, and the icon shows only on the active column.
- Row activation works with Enter and Space when `onRowActivate` is set, with `role="row"` and `tabindex=0`.
- Expandable rows use a disclosure button with `aria-expanded`.
- A horizontal-scroll container keeps its scrollbar **visible**, with a frozen first column at <md.
- Replaces the three copies of `HEADER_CLASS` and every hand-built table.

### 4.6 Tabs
```ts
<Tabs variant="underline" | "segmented" value onValueChange items={[{ value, label, count? }]} />
```
- WAI-ARIA tabs pattern: roving tabindex, arrow keys, Home/End, and `aria-controls` pointing to a real panel id. This fixes the broken ids in `Tabs.tsx:84-86`.
- The underline variant is the default for page-level tabs. Segmented is for small in-card toggles (e.g. Drivers / Constructors).
- Replaces QuietTabs and the 4 inline tablists.

### 4.7 Input, Select, Picker
- The shared `Field` wrapper handles label, hint, error (`danger` text plus icon, `aria-describedby`), `border-strong`, focus ring and a 40px height.
- `Picker` stays (it's the best-built primitive). Fix the nested `role=button` clear control (`Picker.tsx:316`) by moving it outside the trigger.
- Remove `SearchableSelect`.

### 4.8 Dialog and Sheet
- Built on `useModalFocusTrap`: `role="dialog"`, `aria-modal`, labelled by its title, closes on Escape, returns focus to the trigger, and locks scroll.
- `surface-3`, `radius-lg`, `shadow-overlay`, `max-h: 100dvh - 32px` with internal scroll.
- Sheet variant: bottom on phones, right side on desktop (Apex, MobileNav, filters).
- Required for AuthDialog, the PostMedia lightbox, ApexLauncher, MobileNav, ProfileMenu (menu variant), InviteUsers and RaceQuickView.

### 4.9 Alert, Toast, EmptyState, Skeleton
- **Alert**: tone (info / warning / danger / success), icon, title, body, action. Replaces RetryBanner, the brand-red error banners and inline red text blocks.
- **Toast**: bottom-centre on mobile, bottom-right on desktop, `aria-live="polite"`, auto-dismisses after 5 s (errors persist).
- **EmptyState**: **unboxed** by default (icon, one sentence, optional action). A boxed variant exists only for top-level empty pages.
- **Skeleton**: one component with `shape="text" | "block" | "circle" | "row"` and one animation, a subtle opacity pulse (1.6 s). It is static under reduced motion. Remove `.skeleton-shimmer`, the duplicate `components/Skeleton.tsx` and `SectionLoadingMessage`.

### 4.10 Icon
Adopt `lucide-react` (already installed, 0 uses), with stroke width 1.75 and sizes 16 / 20 / 24. Delete the 61 local icon components.

### 4.11 Domain composites (built on the primitives)

| Composite | Contract |
|---|---|
| `PageHeader` | breadcrumb, h1, a meta line, `StateLabel`, actions. Used on race, circuit, driver, team, community, season and archive pages (P19). |
| `PredictionCard` | Specified in [UI_CRITIQUE_AND_REDESIGN.md §4.2](UI_CRITIQUE_AND_REDESIGN.md). Props: `prediction` (with server-computed `state`, `lockAt`, `verdict`, `netPoints`), `context: "feed" \| "community" \| "race"`, `crowd?` (batched), `onEnter`. |
| `DriverIdentity` | Team bar, headshot (24 / 32), code, name (responsive: code only below sm). Used in tables, pickers and results. |
| `SessionSchedule` | Rows of session / local time / track time / state icon. The next session is highlighted with the brand dot. |
| `ProbabilityMeter` | One horizontal stacked bar for the top N plus "Other", with direct labels and `tabular` percentages, and an accessible table fallback (`sr-only`). |
| `ProvenanceLine` | "Source · status · updated time" in `caption text-tertiary`. Mandatory on results, predictions, AI output and weather. |
| `AiSummary` | An `info` icon, "AI summary", generated time, the text, and expandable evidence. Visually quieter than factual data. |

---

## 5. Status and state treatments (canonical)

| Domain | States | Visual |
|---|---|---|
| Race / session | upcoming · live · preliminary · final · cancelled | No badge for upcoming (show the date); `live` badge; `preliminary` warning badge plus ProvenanceLine; final shows nothing; cancelled is neutral with a strikethrough date |
| Prediction round | open · locked · resolved · void | See §4.2. Open is unbadged; the "Closes in …" text turns `warning` in the last 3 hours |
| Personal verdict | correct · partial · incorrect · not entered | ✓ success "+N pts" (net) · ◐ neutral "Partial · +N (net −M)" · ✗ neutral "Incorrect · −N" · muted "You didn't enter" |
| Post | published · pending · scheduled · removed | Pending, scheduled and removed are visible **only** to the author and moderators, as neutral or warning badges |
| Membership | member · pending request · invited · banned | The header button state (Joined ✓ / Requested / Join) |
| Data freshness | fresh · stale · degraded | A ProvenanceLine with "updated 3 min ago". If >2× the expected cadence, a `warning` "Data may be delayed" line. On a degraded source (FastF1 blocked), "Preliminary results from OpenF1". |

---

## 6. Interaction patterns

- **Primary action placement:** in the `PageHeader` actions, or at the bottom of the one interactive card. Never duplicated across rail and main (P19).
- **Optimistic updates:** votes, joins, favourites and prediction entry, each with rollback plus a Toast on failure. Votes and comments already do this; extend it to notifications, favourites (atomic RPC, FEAT-17) and join.
- **Pending feedback:** any action >300 ms shows the button `loading` state. Route transitions show no loader under 300 ms (P15).
- **Confirmation:** destructive actions use an inline `ConfirmButton` (two-step) or a Dialog for irreversible, high-impact ones (delete community, resolve round).
- **Disclosure:** at most 2 levels (P10): section, then Details or an expandable row.
- **Filters:** Chips in a single scrollable row on mobile. The applied state is reflected in the URL (the existing `useUrlParam`).
- **Keyboard:** every interactive element is reachable. `/` focuses search (when global search exists). `Esc` closes overlays.

---

## 7. Charts

- **Library:** Recharts only. Remove the visx `ChampionshipTrajectory` and consolidate.
- **Theme:** `chartTheme.ts` is rewritten to reference the tokens. Gridlines use `border-subtle` at 50%; axes use `caption` in `text-tertiary`. There is no chart background (it sits on surface-1).
- **Fixed heights:** 180px compact, 320px featured. Loading, empty and error states use the same height (P16).
- **Headline above the chart:** "Norris leads by 12 pts" (P10). Direct labels instead of legends; highlight the 2-3 entities in focus (P13).
- Every chart ships an `sr-only` data table or a summary sentence.

---

## 8. Imagery

- Circuit and race photos must be **verified F1 imagery** (DATA-25). Store `media_attribution` and `media_verified_at`; unverified images don't render in heroes.
- Heroes use one image with a scrim that guarantees ≥4.5:1 for text: `linear-gradient(to top, surface-0 0%, surface-0/80% 40%, transparent)`. Measure it against the brightest image region.
- Headshots are always 1:1 with a neutral fallback (initials), using `next/image` with explicit sizes (16 files already use it; 15 raw `<img>` should migrate).

---

## 9. Skeleton and state standard

### 9.1 Rules
1. **No skeleton for loads expected under 300 ms** (cached navigations). Delay skeleton display by 300 ms with a CSS animation delay, which avoids flashes.
2. Skeletons render only **data regions**. Real headers, tabs, buttons and filters render immediately, disabled where needed (Carbon guidance, P15).
3. The skeleton matches the final geometry: row count, column widths and chart height (fixed tokens). The CLS target is 0.
4. One animation (an opacity pulse), static under reduced motion. No "Warming up the grid…" copy line.
5. Transition from skeleton to content with a 120ms opacity crossfade, and no layout animation.
6. Each route has its own `loading.tsx` whose skeleton comes from the **same layout component** as the page (a `<RacePageLayout skeleton />` prop). This keeps skeletons in sync by construction, rather than hand-mirroring 45 skeleton functions.

### 9.2 Per-surface skeleton spec

| Surface | Skeleton shape |
|---|---|
| PageHeader | Real breadcrumb (from params); title block 1 × `display-md` line at 40% width; meta line at 60%; no badge |
| Race result table | Real column headers; 10 rows × 44px (driver cell: 24px circle + 2 text bars; right-aligned numeric bars); "Show all" row |
| Session schedule | 5 rows × 44px with real session labels (known statically) and time bars |
| Prediction card | Context line bar (60%), question bar (`title-md`, 80%), stakes line bar (50%), the crowd meter's reserved 28px block, 3 picker placeholders at 40px |
| Community feed | 5 list items: 20px avatar + a 40% line; title bar 70%; 2 body lines; action row of 3 × 24px circles |
| Standings | Real headers; 10 rows × 44px |
| Charts | A fixed-height block (180 / 320) with a faint baseline, and a real title |
| Rails | Each block's real heading plus 3 rows of bars; never a single tall grey slab |
| Profile / following | Real tabs; list of 8 rows × 52px |
| AI summary | Real "AI summary" label + 3 text lines + "Generating…" in `caption` (an honest delay message for >2 s, with the elapsed time after 8 s) |
| Forms (profile edit, notifications) | Real labels; input-height bars |

### 9.3 State model (apply where relevant; not to static components)

| State | Treatment |
|---|---|
| Initial loading | Skeleton per §9.2 |
| Background refresh | Keep the content; a subtle "Updating…" in the ProvenanceLine; no skeleton |
| Loaded | — |
| Empty | Unboxed EmptyState with the reason and the next action ("No results yet: the race starts Sun 17:00") |
| Partial data | Render what exists, with a ProvenanceLine ("Qualifying data unavailable for this round") |
| Stale | ProvenanceLine in `warning` ("Last updated 3 h ago; live data delayed") |
| Error | An inline Alert in the region with a **Retry** button. One region failing never fails the page (fixes FEAT-06). |
| Retry | The button shows the loading state; after 3 failures, show a support hint |
| Disabled | The control is disabled with a reason ("Locked at lights out") |
| Submitting | The button's loading state; inputs read-only |
| Success | Inline confirmation or a Toast; state persisted |
| Permission denied | An inline explanation plus the path forward ("Join Tifosi United to enter"), never a blank area |

---

## 10. Accessibility requirements (acceptance gate)

- WCAG 2.2 AA: text ≥4.5:1 (large text ≥3:1); control boundaries and focus ≥3:1. The tokens above satisfy this, and lint prevents regressions.
- One visible focus style: a 2px `--focus-ring` outline plus a 2px offset, on every interactive element. No `outline-none` without a replacement (lint rule).
- A single `<main>`; exactly one `h1` per page; headings in order; section titles are headings.
- Every overlay uses the Dialog primitive (focus trap, Escape, return focus).
- Tabs, listbox and table-sort patterns per WAI-ARIA APG.
- Targets ≥24×24px; primary actions ≥40px tall (44px on touch).
- `aria-live="polite"` for Apex answers, toasts and async form results.
- Colour is never the only cue (P14): signs and arrows on deltas, icons on states, codes with team colours.
- Reduced motion is respected everywhere (§2.6).
- User-uploaded images get an optional alt text field in the composer, defaulting to a descriptive fallback ("Image from Sam's post"), not `alt=""`.
- Skip-to-content link.

---

## 11. Content style

- Sentence case. Numbers as numerals. Times as "Sun 4 Oct · 17:00 your time (18:00 local)".
- Name AI output as AI ("AI summary", "Apex"), and never state predictions as facts.
- Data labels: "Preliminary", "Official", "Back-filled after the race", "Model v2 · frozen before qualifying".
- Keep the current editorial voice for marketing and empty states, but keep the chrome terse.

---

## 12. Enforcement

1. Tokens in `globals.css` plus the `@theme` mapping (task DS-01).
2. ESLint rules (custom or `eslint-plugin-tailwindcss` with a config) banning:
   - `text-\[\d` (arbitrary font sizes)
   - `\[var\(--` (bypassing token utilities)
   - `#[0-9a-f]{3,6}` in className
   - `outline-none` without `focus-visible:`
   - raw `<button className=` outside `ui/`, after migration, as a warning
3. Visual-regression snapshots (Playwright) per primitive and state, plus per route at 390 / 820 / 1440.
4. Automated a11y (`@axe-core/playwright`) on the key routes in CI.
5. A dev-only `/dev/ui` preview page listing every primitive and state, which doubles as documentation.
