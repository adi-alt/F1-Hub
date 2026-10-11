# UI/UX Audit

Audit date: 2026-09-28 · Commit `8922571`.

**Evidence base:**
- **Code metrics:** grep and perl counts over all 289 `.tsx` files. They count class tokens as written, including conditional branches, so they measure implementation variety rather than rendered frequency.
- **Component reading:** every file named below was read at the cited lines.
- **Screenshots:** a production build of this commit (`next build && next start`), captured with headless Chrome at 1440×1000, 1440×3400, 820×1180 and 390×844. **Only signed-out views could be captured.** Every route except `/` is sign-in gated, and no session was forged, so signed-in views are assessed from code only (see [AUDIT_COVERAGE.md](AUDIT_COVERAGE.md)).

Companion documents:
- [UI_CRITIQUE_AND_REDESIGN.md](UI_CRITIQUE_AND_REDESIGN.md): route-by-route critique and target layouts.
- [DESIGN_SYSTEM_SPEC.md](DESIGN_SYSTEM_SPEC.md): the target system.
- [COMPONENT_REDESIGN_BACKLOG.md](COMPONENT_REDESIGN_BACKLOG.md): the implementation tasks.
- [DESIGN_BENCHMARKS.md](DESIGN_BENCHMARKS.md): principles P1-P20.

---

## 1. Verdict

The owner's concern is **correct, and the cause is structural, not cosmetic.** Apex F1 Hub has an identity: near-black, F1 red, Geist, real driver headshots and real circuit SVGs. It has no design system underneath that identity. The generic, AI-generated look comes from five measurable causes:

| Cause | Measurement | Effect |
|---|---|---|
| **Surfaces are invisible**, so borders do all the separation | `--f1-carbon` against the background = 1.12:1; `carbon/60` = **1.06:1**; 37 distinct card fills | Every group needs a hairline box, and boxes nest: 166 card containers with 132 distinct class strings, up to 3 border levels inside one feed item |
| **Micro-labels replace headings** | 245 `uppercase tracking-*` labels (104 variants, 16 tracking values) against 70 real `h1`-`h4` elements in the whole app | Every block is announced by a grey 10-12px eyebrow, the strongest "template dashboard" tell |
| **The type scale has collapsed at the small end** | 570 arbitrary `text-[Npx]` in 21 sizes (9, 9.5, 10, 10.5, 11, 11.5, 12.5, 13.5, 14.5…); 220 at ≤10px; `text-base` used 13 times | No hierarchy step between 12px and 24px; everything is "small and tidy" |
| **Red means everything** | `var(--f1-red)` appears 421 times in 44 utility forms with 12+ meanings | An error, a "Resolved" badge, the active tab and the primary CTA look the same. One prediction card has 4 red elements. |
| **No shared primitives** | 219 distinct `<button>` class strings among 270; 14 red primary buttons with 14 different class strings; 40 variants among 42 badges; 61 hand-drawn icon components while `lucide-react` is installed and unused | Every screen re-decides every detail, so nothing looks designed as a whole |

These are layered with atmospheric effects that add noise without meaning: 4 random blurred colour streaks per request (`AmbientBackground.tsx:15-41`), a z-100 grain overlay (`globals.css:57-66`), a rotating photo backdrop, a red radial glow, per-card `backdrop-blur`, and motion on 199 elements.

---

## 2. Screenshot findings (signed-out, production build)

The screenshots are in [`screens/`](screens/): `signed-out-d_*` (1440px), `signed-out-t_home` (820px), `signed-out-m_home` (390px).

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| **UX-S1** | High (trust) | **The hero states the wrong venue.** "Bahrain Grand Prix / Kuala Lumpur". The Track intelligence card beside it shows Sepang history ("Record spanning 1999-2017", "Defending winner (2017)") and a **sportscar** photo (an Asian Le Mans "4H" Sepang banner is visible). This is the first thing every visitor sees. | `d_home.png`; DATA-05, DATA-25 |
| **UX-S2** | High (mobile) | **Horizontal overflow at 390px.** The championship line is clipped ("…with 276 p") and the Track intelligence card runs past the right edge. | `m_home.png` |
| UX-S3 | Medium | **About 700px of empty dark space** between the "What you can explore" section and the footer on desktop | `d_home_tall.png` y≈2400-3100 (original pixels) |
| UX-S4 | Medium | The session timeline (P1…R) labels are about 10px grey on a dark photo, which is barely legible. The dots carry no state. | `d_home.png` |
| UX-S5 | Medium | **Four accent systems on one page:** red eyebrows ("ROUND 16", "WHY F1 HUB", "WHAT YOU CAN EXPLORE"), amber eyebrows in the explore road ("3 MODELS", "10,000 SIMS / RACE"), a red CTA, and red icons | `d_home_tall.png` |
| UX-S6 | Medium | The hero photo at about 40% opacity under a gradient scrim reads as muddy rather than atmospheric. Text sits on uneven luminance. | `d_home.png`, `t_home.png` |
| UX-S7 | Medium | **Signed-out visitors see no navigation.** The header shows only the logo, "Sign in" and "Sign up". The page offers both "Sign up" (header) and "Sign up free" (hero) side by side. | all screenshots |
| UX-S8 | High (product) | **Every other route shows a sign-in gate.** `/season`, `/circuits`, `/archive`, `/groups`, `/race` and `/models` render an identical centred card ("Sign in to view…"). The gate width differs by route: 976px on circuits, 1232px on archive, 1360px on groups. It sits over an empty dark page with random coloured blur streaks. Public F1 data (results, standings, history) is hidden from visitors and search engines. | `d_circuits.png`, `d_archive.png`, `d_groups.png`, `d_race.png`, `d_models.png` |
| UX-S9 | Low | The header content (logo at x≈168) doesn't align with the page content (x≈192 on home, x≈40 on groups, x≈104 on archive) | all desktop shots |
| UX-S10 | Low | The explore "road" is a long scroll-driven illustration with cards alternating left and right. It is charming but about 1,500px tall, and it explains features in marketing prose rather than showing them. | `d_home_tall.png` |

---

## 3. Design-system gaps

| ID | Gap | Evidence | Fix (see DESIGN_SYSTEM_SPEC) |
|---|---|---|---|
| UI-01 | The theme layer is unused. `@theme inline` registers `bg-f1-red`, `border-f1-line` etc., but there are **0 uses**. All 818 colour references are arbitrary `[var(--x)]`. | `globals.css:34-42` | Semantic tokens mapped into `@theme`; lint bans on `[var(--*)]` and `text-[Npx]` |
| UI-02 | There is no surface ladder, so surfaces are indistinguishable from the page | contrast 1.06-1.12:1 | 4-step surface ladder with ≥1.2:1 steps |
| UI-03 | Three grey families: zinc for tokens and floating panels, neutral for text (1,415 uses), warm chart ink | `chartTheme.ts:9-10`; `Popover.tsx:114` | One neutral ramp |
| UI-04 | Red is overloaded (above) | 421 uses | Brand red for primary action, live state and brand mark only; a separate `danger` token |
| UI-05 | Type scale collapse | 570 px sizes | 7-step scale, nothing under 12px |
| UI-06 | Micro-label as the default heading | 245 labels; `RaceSectionCard.tsx:36` | `SectionHeader` using a real `h2`/`h3` in sentence case |
| UI-07 | No Button, Card, Badge, Input, Dialog, Table, Alert or Icon primitive | counts above; `HEADER_CLASS` copied into 3 files | Create 9 primitives |
| UI-08 | Nested bordered panels | PredictionFeedCard → PredictionTrendBars → PredictionEntry → Picker (3 borders); RaceSectionCard → RaceSubSection → `surface-inset` (4-level model documented at `RaceSubSection.tsx:3-9`) | One container level per section |
| UI-09 | Duplicate implementations | 2 Skeletons + a third shimmer system; 6+ tab implementations; 2 selects; 2 ChampionshipTrajectory charts in 2 libraries; 2 prediction cards | See the inventory §3.4 |
| UI-10 | Dead components | 11 files including NextRaceCard and ResultsBoard | Delete |
| UI-11 | APIs that fight design: `className` passthrough with no variants; ConfirmButton replaces its whole class; EmptyState bakes in a box; RaceSectionCard is `motion.section layout` | — | Variant-based APIs |
| UI-37 | Motion without a system: 116 files import framer-motion, 199 `motion.*` elements, 13 with `layout`, 11 animating `height:auto`, 19 durations | — | 3 durations; no layout or height animation in feeds |

## 4. Layout and navigation

| ID | Finding | Evidence |
|---|---|---|
| UI-12 | **The root scroll architecture has real costs.** `body` is `overflow-hidden`, and a Lenis-managed `<div class="scrollbar-hide overflow-y-auto">` is the only scroller. Consequences: no scrollbar on any page; keyboard scrolling only after focus lands inside; forced scroll-to-top on every pathname change including Back; iOS tap-to-top and URL-bar collapse lost; Lenis ignores reduced motion and scrolls slower than native (wheelMultiplier 0.8). | `layout.tsx:39`; `SmoothScroll.tsx:29-38`; `useLenisContainer.ts:69-91` |
| UI-13 | **11 page container widths**, and the header is `max-w-6xl` (1152px). There is no active nav state and no `aria-current`. MobileNav has no Escape or focus handling. The footer appears only for signed-out visitors on `/`. | `Header.tsx:23, 46-69`; `MobileNav.tsx:35-79` |
| UI-14 | **Right rails are overstuffed and built four different ways.** RaceSidebar: up to 7 blocks + Trending + a filler "Ask Apex" card, placed at the bottom of the page on mobile. CommunityRightRail: 4 cards, Members and Posts shown twice, sticky with no max-height. GroupsRightSidebar: 10 font sizes and 14 text colours, duplicates feed predictions, placed below the whole feed on mobile. GroupsLeftSidebar hides the page `h1` below `lg`. | see UI_CRITIQUE §3, §5 |
| UI-15 | 27 `grid-cols-*` patterns and 13 arbitrary rail templates (248/296/300/320/340/360px rails). There is no layout shell. | grep |
| UI-16 | Atmospheric noise: AmbientBackground is random per request (a server `Math.random`, which also produces a different page each load); the grain overlay sits above all content; rotating backdrop, radial glow, scrims | `AmbientBackground.tsx`; `HomeLayout.tsx:43-56`; `RotatingBackdrop.tsx:23` |

## 5. Component-level visual problems (summary)

The full critique with line numbers is in UI_CRITIQUE_AND_REDESIGN.md.

| Component | Problem in one line |
|---|---|
| PredictionFeedCard / PredictionEntry / PredictionTrendBars | 6 arbitrary font sizes, 9 text colours, 3 nested borders, entry count ×2, cost ×2, type ×2, 4 red elements, a 28px CTA, the card grows twice after mount |
| Community PredictionCard | Same entity with a different header, CTA radius and badge language. A red "Resolved" badge. "N people have entered" above trend bars showing the same count. |
| PostCard / PostHeader / PostActionBar | 9.5px uppercase role tags; 4 bordered pills per post; per-card backdrop blur |
| RaceHeader | The back link (`text-xl sm:text-2xl`) is nearly the size of the h1 |
| RaceSectionCard | Every race-page module is the same bordered box with a grey uppercase `<p>` title |
| RaceHero (home) | `h2` greeting above the `h1`; two stacked red eyebrows; the countdown re-renders every second |
| ChampionshipStandings | Favourites row has a red left border, a red tint and a red gradient. Sort is on `<th onClick>` with no keyboard access or `aria-sort`. Expanded rows add inset bordered panels. |
| SeasonCalendar | 9px axis and 9px uppercase tags inside a 1.2%-white blurred box |
| UserManagement | Yet another badge format; brand-red error banner |
| AuthDialog | No `role=dialog`, no Escape, no focus trap; translucent `zinc-900/70` panel over random streaks; `min-h-[560px]` clips on short phones |
| ApexLauncher | Floating pill with no `aria-live`; `outline-none` input; fallback text is shown as an answer |

## 6. Accessibility

| ID | Finding | Evidence | WCAG |
|---|---|---|---|
| UI-28 | `neutral-500` (the de facto secondary text, 594 uses) is **3.2-4.2:1**, failing on every surface. `neutral-600` (184 uses, including 22 placeholders) is 1.95-2.55:1. Red as small text (128 uses) is 3.1-4.0:1. Input borders are 1.43:1. White on the red button is 4.97:1 but drops to about 4.2:1 at `hover:brightness-110`. | contrast table in the source notes | 1.4.3, 1.4.11 |
| UI-29 | 9 `outline-none` without a replacement (Picker search, ApexLauncher input, TopicFilter, EmojiPicker, GifPicker, CreateCommunityModal ×2, FeedControls, AnalysisWorkspace). 230 of 270 buttons have no focus style and rely on browser defaults. | — | 2.4.7 |
| UI-30 | The focus trap covers only 4 of about 13 overlays. **AuthDialog, the PostMedia lightbox, ApexLauncher, ProfileMenu and MobileNav have none.** Popover doesn't move focus in. | `useModalFocusTrap` usage | 2.1.2, 2.4.3 |
| UI-31 | `ui/Tabs` ARIA references point to ids that don't exist (`Tabs.tsx:84-86` vs `YourF1.tsx:236`). CommunityWorkspace tabs have no arrow keys. Picker nests a `role=button` span inside a `<button>` (`Picker.tsx:316-322`). Table sort is on `<th onClick>` (1 `aria-sort` in the app). `tr onClick` without keyboard access. 10 div/span/tr click handlers. | — | 4.1.2, 2.1.1 |
| UI-32 | Two `<main>` landmarks on `/groups`. Section titles are `<p>`. No `h1` on `/groups` below `lg`. The RaceHero heading order is inverted. 16 `alt=""` on user-content media. Only 2 `aria-live` regions. | — | 1.3.1, 2.4.6, 1.1.1, 4.1.3 |
| UI-33 | 22 buttons are 24-28px. Text-only buttons at 11px ("Edit", ConfirmButton). | — | 2.5.8 |
| UI-34 | Reduced motion: framer-motion respects it globally (`MotionConfig reducedMotion="user"`, `AppProviders.tsx:23`), which is good. Lenis, RotatingBackdrop, `animate-pulse` skeletons and hover scales do not. | — | 2.3.3 |
| UI-38 | The Apex floating pill (bottom-left) and sticky rails have no `scroll-padding`, so they can obscure focused controls | `ApexLauncher.tsx:116` | 2.4.11 |
| UI-39 | No `color-scheme: dark`, so native controls and scrollbars may render light. No light theme. | `globals.css` | — |

## 7. Responsive behaviour

| Breakpoint | Finding |
|---|---|
| Phone (390px) | Hero overflow (UX-S2). The race rail stacks **below** a long page, so the countdown and result are at the very bottom. The groups right rail sits below the whole feed. The GroupsLeftSidebar and its `h1` are hidden. `h-[calc(100dvh-4rem)]` fixed-height columns (10 occurrences) inside an inner scroller fight mobile browser chrome. AuthDialog `min-h-[560px]` clips. |
| Tablet (820px) | Home hero stacks acceptably (`t_home.png`), but the Track intelligence card goes full-width with a very wide photo. Three-column groups layout collapses at `lg` with no intermediate 2-column layout. |
| Desktop (1440px) | 11 content widths; groups and race extend about 144px past the header on each side. Three independently scrolling columns on `/groups` with hidden scrollbars. |
| Tables | `ArchiveTable` hides its horizontal scrollbar (`scrollbar-hide overflow-x-auto`, `:144`), so there is no cue that it scrolls sideways. |

## 8. Skeletons and loading (visual)

| ID | Finding |
|---|---|
| UI-35 | Route skeletons don't match their routes. The root `loading.tsx` is the **public** homepage skeleton, so signed-in users see 2 different skeleton flashes on `/`, and `/models` and `/auth/*` show the homepage skeleton. `circuits/loading.tsx` (grid) also covers circuit detail. `profile/loading.tsx` (a favourites table) covers the edit and notifications forms. `race/loading.tsx` is single-column for a 2-column page. |
| UI-36 | Three skeleton systems (pulse at `white/10`, shimmer at `white/[0.04]`, and both combined) with 3 radii. 45 hand-built skeleton functions. PersonalHome has 6 sections but its skeleton has 5. |
| UI-40 | Every route skeleton is headed by `SectionLoadingMessage`: a pulsing red dot plus an uppercase line such as "Warming up the grid…". Then `template.tsx` fades the page in (opacity + y:8), then cards stagger in. That is three motion layers for one load. |
| UI-41 | PredictionTrendBars renders a skeleton, then collapses to nothing when there are fewer than 3 entries. Cards animate `height` 0→auto on fetch, which causes layout shift across the feed. |

## 9. What works and should be preserved

- **Identity cues:** near-black canvas, F1 red as the brand mark, Geist, real driver headshots (`EntityAvatar`, 31 importers), 47 real circuit SVG paths (`circuitShapes.json`), team-colour data (`teamColors.ts`).
- **Picker** (listbox, `aria-activedescendant`, keyboard support) is the best-built primitive; use it as the reference for others.
- **Archive loading** branches on searchParams to pick the matching skeleton, which is the right pattern.
- **Honest copy:** the notifications page says emails don't go out yet, and results show a "Preliminary" label.
- **Optimistic interactions:** votes (request-id guard and revert) and comments (failed state and retry).
- **The global `MotionConfig reducedMotion="user"`.**
- **The editorial voice** of the landing copy ("Real predictions, not vibes") is distinctive, and more product-specific than the visuals.

## 10. Recommendations: styling fix vs structural redesign

| Problem | Styling only | Needs a structural or IA change |
|---|---|---|
| Contrast failures, type scale, red overload, radius and shadow variety | ✅ tokens plus lint | — |
| Nested borders | partially (a surface ladder removes the need) | ✅ unbox sub-sections; one container level |
| Micro-labels | ✅ SectionHeader | — |
| Prediction card clutter | — | ✅ a new composition and state machine (one component) |
| Right rails | — | ✅ content audit; contextual rail; mobile reorder |
| Race page | partially | ✅ answer-first reordering; tabs for depth |
| Scroll architecture | — | ✅ native document scroll |
| Sign-in walls | — | ✅ product decision (D-02): public read-only pages |
| Skeleton mismatches | ✅ per-route `loading.tsx` | — |
| Dead components | ✅ delete | — |
