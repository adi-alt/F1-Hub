# Design Benchmarks

Research date: 2026-09-28. This document lists the reference products and authoritative guidance used to judge Apex F1 Hub's UI, the principles extracted from each, and how each applies to this app.

**Access status** (be honest about what was actually seen):
- **FETCHED**: the page was retrieved and its content read. The fetcher does not render JavaScript or pixels, so interface claims describe structure and content, not exact visual styling.
- **SEARCH-ONLY**: the claims come from search snippets or secondary write-ups, and the primary page was not read. Treat these as unverified.
- **FAILED**: the fetch errored. The page is listed so nobody assumes it was reviewed.

Totals:
- 60 sources were fetched with usable content.
- 4 were fetched but empty (JavaScript shells or paywall pages).
- 14 topics are search-only.
- 16 fetch attempts failed.
- Discord was not researched.

These are **benchmarks, not templates**. Nothing here recommends copying another product's branding or F1's proprietary typefaces.

---

## 1. Motorsport and sports products

| Source | Status | What it shows | Application to Apex F1 Hub |
|---|---|---|---|
| F1 race results index: https://www.formula1.com/en/results/2025/races | FETCHED | A single flat table: Grand Prix + flag, Date, Winner (small portrait and three-letter code), Team (logo), Laps, Time. No status badges. Filters are a side list plus a year dropdown. Uppercase appears only in the page title. | Results and standings become flat tables without card wrappers. Identity comes from a three-letter code plus a team-colour mark, with no badges in rows. |
| F1 driver standings: https://www.formula1.com/en/results/2025/drivers | FETCHED | Five columns: Pos, Driver, Nationality, Team, Pts. | The default standings view should have about 5 columns. Move gap, form and sparkline columns into an expandable or "detailed" view. |
| F1 driver profile: https://www.formula1.com/en/drivers/max-verstappen | FETCHED | Three tabs (Statistics, Biography, News). Stats sit in 4 labelled groups as large-number / label pairs. | Driver and team pages use grouped label/value stats, not a card per stat. |
| F1 2026 calendar: https://www.formula1.com/en/racing/2026 | FETCHED | Image cards per round. Completed rounds show the top 3. The next round carries a single "NEXT RACE" label. | Cards are appropriate for the calendar (a browsing task), but carry **at most one state label per card**. |
| F1 race hub (Australia 2026): https://www.formula1.com/en/racing/2026/australia | FETCHED | Order: title → schedule with collapsible sub-links (Report, Results, Highlights) → results table → circuit info → articles. One chequered-flag icon marks a completed session. | On race pages, schedule and result go above the fold, and circuit facts and history go lower. Use one completion icon per session instead of "Completed / Final" badges. |
| F1 Live Timing: https://www.formula1.com/en/timing/f1-live | FETCHED, but minimal (paywall page) | — | Live-timing layout **not verified**. |
| F1 app relaunch (trade press, 2025-06-20): https://www.performanceracing.com/magazine/industry-news/06-20-2025/f1-launches-new-personalized-mobile-app-website | FETCHED | Fans pick multiple drivers and teams to personalise. Adaptive font sizes, light and dark modes. | Follows should **filter and emphasise** existing content, not add more modules. Plan for light mode. |
| F1 2018 identity (Creative Review): https://www.creativereview.co.uk/formula-1-logo-wieden-kennedy-london/ | FETCHED | Red as the primary colour on white or black; team and sponsor colours are part of the system. Proprietary F1 typefaces. | Red is the brand mark. Team colours carry data identity. Do not bundle F1 fonts. |
| ESPN F1 standings: https://www.espn.com/f1/standings | FETCHED | Drivers and Constructors tabs; a dense per-race matrix (3-letter race codes as columns) in a plain table. | A "season matrix" alternate standings view with a sticky first column and heat-shaded cells. |
| ESPN scoreboard: https://www.espn.com/nba/scoreboard | FETCHED (limited, preseason) | Primary line (teams, score), secondary metadata quieter underneath, actions as text links. | Race rows: primary line, then one muted metadata line, then text-link actions. |
| The Athletic / NYT app redesign | SEARCH-ONLY | — | No interface claims made. |
| TracingInsights: https://tracinginsights.com/ | FETCHED | Lap-time heatmap, stint strips coloured by compound, race trace with symbol markers for pits and fastest laps, position-change chart. | Colour must carry meaning: tyre compound, pace ramp or team identity. Mark events with symbols as well as colour. |
| F1 Tempo | FETCHED, but minimal | — | Not verified. |
| Jolpica F1 (Ergast successor): https://github.com/jolpica/jolpica-f1 | FETCHED | Open, volunteer-run F1 API with Ergast-compatible endpoints. | A provenance credit ("Data: FastF1, OpenF1, Jolpica") in the footer or an info popover, not a badge on every panel. It is also a candidate source for official classification from CI (DATA-02). |

## 2. Application design leaders

| Source | Status | Principles | Application |
|---|---|---|---|
| Linear, "How we redesigned the Linear UI (part II)", 2024-03-28: https://linear.app/now/how-we-redesigned-the-linear-ui | FETCHED | The theme is generated from 3 inputs (base, accent, contrast) in LCH instead of 98 variables. Stated goal: "reduce visual noise… increase the hierarchy and density". Less chromatic tint. Display type is used only for headings. | Generate neutrals and surfaces from a few OKLCH tokens. Keep neutrals near-achromatic, with F1 red as the single strong hue in the chrome. |
| Linear, "A calmer interface for a product in motion", 2026-03-12: https://linear.app/now/behind-the-latest-design-refresh | FETCHED | "Don't compete for attention you haven't earned." Navigation recedes. Fewer and smaller icons. Coloured icon backgrounds removed. Fewer separators. | Dim the global nav and right rails relative to the main column. Remove icon chips and coloured backgrounds behind section titles. Use spacing instead of separators. |
| Linear changelog, 2026-03-12: https://linear.app/changelog/2026-03-12-ui-refresh | FETCHED | Consistent headers and view controls across entity types. | One entity-page header pattern for race, driver, circuit, community and market. |
| Stripe, "Designing accessible color systems", 2019: https://stripe.com/blog/accessible-color-systems | FETCHED | Perceptually uniform colour space. Steps "at least five levels apart" guarantee small-text contrast. | Ramp tokens where step distance guarantees contrast. Check team colours on dark surfaces. |
| Stripe Apps, "Design your app": https://docs.stripe.com/stripe-apps/design | FETCHED | Brand expression is confined to a single indicator. Contextual view by default; a focused view only for longer uninterrupted tasks. | Team colour appears only as a 3-4px bar or dot, never as tinted panels. Entering a prediction is a focused task and can use a sheet. |
| Stripe Apps chart layout: https://docs.stripe.com/stripe-apps/patterns/chart-layout.md | FETCHED | Choose the chart by the question. Fixed chart heights (180px compact, 320px featured). At most 3 charts in a row. Headline value above the chart. The same height for loading, empty and error. | Race and prediction modules lead with the answer ("NOR 34% to win"). Chart skeletons are the final height. |
| Stripe Apps loading: https://docs.stripe.com/stripe-apps/patterns/loading.md | FETCHED | Delay spinners 200-300ms. Keep the tab bar visible and load inside the tab. Use pending states on action buttons. | Remove the route-level "loading…" micro-label. Tabs stay interactive. The Submit prediction button gets a pending state. |
| Stripe Apps action buttons: https://docs.stripe.com/stripe-apps/patterns/action-buttons.md | FETCHED | Actions live in one consistent place, the header. | One action area per page header (Join, New post, Enter prediction), not buttons scattered across cards. |

## 3. Design systems

| Source | Status | Principles | Application |
|---|---|---|---|
| Atlassian Lozenge: https://atlassian.design/components/lozenge/usage | FETCHED | For meaningful status or state only. Don't mix semantic and accent colours. Use bold sparingly. Sentence case. Not interactive, and not colour-only. | **One** state lozenge per prediction (Open, Locked, Resolved, Void). This one-per-item limit is our inference from the guidance; Atlassian gives no number. |
| Atlassian Spacing: https://atlassian.design/foundations/spacing | FETCHED | 8px base. Small steps inside components, medium for groups, large for layout. "Use scale and whitespace to rank elements." | Separate sections with 32-48px of space instead of bordered panels. |
| Shopify Polaris Badge: https://shopify.dev/docs/api/app-home/polaris-web-components/feedback-and-status-indicators/badge | FETCHED | Badges for system status; merchant tags use a different component. A fixed tone set. 1-2 words. Past tense for completed states. The same tone for the same status everywhere. | Status badge vs category chip are separate components. Open = neutral, Locked = caution, Resolved = neutral or success, Void = critical. |
| GitHub Primer Label and StateLabel: https://primer.style/product/components/label/, https://primer.style/product/components/state-label/ | FETCHED | A separate StateLabel for workflow state, always with an icon. | One prominent state marker with an icon. Round, circuit and time are plain muted text. |
| IBM Carbon data table (raw source): https://raw.githubusercontent.com/carbon-design-system/carbon-website/main/src/pages/components/data-table/usage.mdx | FETCHED | 5 row heights. The toolbar holds global actions only. A sort icon only on the sorted column. Expandable rows for detail. | Results and qualifying tables use 36-40px rows, an active-only sort icon, and per-driver detail in expandable rows. |
| IBM Carbon skeleton guidance | SEARCH-ONLY (primary pages 404 or truncated) | Skeletons for containers and data only, never for buttons, inputs or toggles. Load progressively. | Keep the real headers, tabs and buttons visible while data regions load. |
| IBM Carbon data-viz palettes (raw source) | FETCHED | Apply categorical colours in strict sequence. Alert colours are reserved for status. | Don't use F1 red both as brand and as "danger" or "down" in charts. |
| IBM Carbon writing style (raw source) | FETCHED | Sentence case for all UI text. All caps is slower to read. | Cut the 245 uppercase micro-labels to one tier (table column headers). |
| GOV.UK Details: https://design-system.service.gov.uk/components/details/ | FETCHED | Hide information only some users need. Never hide what most users need. | Put methodology and feature importances behind "How this prediction works". Predicted order and probability stay visible. |
| Material 3 elevation / typography | FAILED; SEARCH-ONLY (JavaScript shell) | Tonal surfaces over shadows; state-layer opacities. Unverified. | Directionally supports tonal surfaces. Don't cite the exact percentages until they're verified. |
| Apple HIG Dark Mode | FAILED; SEARCH-ONLY | Base vs elevated background sets; semantic colours. | Raised surfaces are lighter, not more translucent. Name tokens semantically. |

## 4. Accessibility standards

| Source | Status | Requirement | Where Apex fails today |
|---|---|---|---|
| WCAG 2.2 SC 1.4.3 Contrast (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html | FETCHED | 4.5:1 normal text; 3:1 large text | `neutral-500` secondary text is 3.2-4.2:1 (594 uses). `neutral-600` is 1.95-2.55:1 (184 uses). F1 red as small text is 3.1-4.0:1. |
| SC 1.4.11 Non-text Contrast | FETCHED | 3:1 for component boundaries and focus | Input borders are 1.43:1 (`--f1-line`). Focus borders `white/20-30` are 1.75-2.59:1. |
| SC 1.4.1 Use of Color | FETCHED | Colour must not be the only cue | Green and red deltas, colour-only market state, team colour without a code in some charts |
| SC 2.4.7 Focus Visible / 2.4.11 Focus Not Obscured | FETCHED | Visible focus that isn't hidden by sticky UI | 9 `outline-none` without a replacement. The Apex floating pill and sticky rails can cover focus. |
| SC 2.5.8 Target Size (Minimum) | FETCHED | 24×24 CSS px | 22 buttons are 24-28px, and some text-only buttons are smaller |
| SC 2.3.3 Animation from Interactions; MDN prefers-reduced-motion | FETCHED | Motion can be disabled | Lenis, RotatingBackdrop, `animate-pulse` and hover scales ignore reduced motion |
| Adrian Roselli, "WCAG3 Contrast as of April 2026": http://adrianroselli.com/2026/04/wcag3-contrast-as-of-april-2026.html | FETCHED | APCA is not a standard yet; WCAG 2 remains the gate | Use APCA only as a secondary check for light-on-dark weights |

## 5. Perceived performance and skeletons

| Source | Status | Principle | Application |
|---|---|---|---|
| NN/g Skeleton screens: https://www.nngroup.com/articles/skeleton-screens/ | FETCHED | No indicator under 1 s. Skeletons for 2-10 s. Frame-only skeletons aren't recommended, and animation can distract. | Don't show skeletons for cached navigations. Skeletons match the final layout. One subtle pulse at most. |
| NN/g Response times: https://www.nngroup.com/articles/response-times-3-important-limits/ | FETCHED | 0.1 s / 1 s / 10 s limits | Optimistic votes and entries (already done). Stream Apex answers. |
| web.dev Core Web Vitals and CLS: https://web.dev/articles/vitals, https://web.dev/articles/cls | FETCHED | LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1. Reserve space. Animate transforms, not height. | 11 components animate `height:auto`. Trend bars and entry panels shift the feed after mount. |

## 6. Hierarchy, cards, rails and badges

| Source | Status | Principle | Application |
|---|---|---|---|
| NN/g Visual hierarchy: https://www.nngroup.com/articles/visual-hierarchy-ux-definition/ | FETCHED | Contrast in value creates hierarchy. "Use no more than 3 sizes." Squint test. | About 3 type sizes per view. Apex files use 6-10. |
| NN/g Cards: https://www.nngroup.com/articles/cards-component/ | FETCHED | Cards suit browsing heterogeneous content. They de-emphasise ranking and are "less scannable than lists". | Standings, results, leaderboards, member lists and market lists are lists or tables. Cards are for the home feed and calendar. |
| NN/g Indicators: https://www.nngroup.com/articles/indicators-validations-notifications/ | FETCHED | Contextual, conditional, passive. Too many add noise. | Don't badge default states ("Open"). Badge only the exceptions ("Closes in 2h", "Locked"). |
| NN/g Progressive disclosure: https://www.nngroup.com/articles/progressive-disclosure/ | FETCHED | Primary items first. Two levels at most. | Race page: result, next session and headline prediction first; strategy and methodology on demand. |
| NN/g Right-rail blindness: https://www.nngroup.com/articles/fight-right-rail-blindness/ | FETCHED | Users ignore ad-like rails. "The less graphical it is, the more attention." Keep rails relevant to the page. | Rails become plain, contextual lists. No promo cards such as "Ask Apex". |
| NN/g Banner blindness: https://www.nngroup.com/articles/banner-blindness-old-and-new-findings/ | FETCHED | Ad-like styling gets ignored and "poisons" adjacent items. | Gradient or glow promo cards for Apex and communities will be ignored. |
| NN/g Glassmorphism: https://www.nngroup.com/articles/glassmorphism/ | FETCHED | Contrast risk; overuse overwhelms. | At most one glass layer (a sticky header over imagery). Content surfaces are opaque. |
| NN/g Data tables: https://www.nngroup.com/articles/data-tables/ | FETCHED | Four table tasks. Freeze headers and first columns. Use a side panel for record detail. Put row actions in a menu. | Freeze the driver column in wide tables. Row click opens a side panel. |
| Refactoring UI principles | FAILED (403); SEARCH-ONLY via secondary notes | "Emphasise by de-emphasising." Fewer borders. | Make secondary content quieter instead of making primary content red. |

## 7. Data visualisation

| Source | Status | Principle | Application |
|---|---|---|---|
| NN/g Clutter-free charts: https://www.nngroup.com/articles/clutter-charts/ | FETCHED | No gradients, 3D or shadows. Thin gridlines. Direct labels instead of legends. | End-of-line driver codes; no gradient area fills unless they encode something. |
| Tufte, "Sparkline theory and practice": https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/ | FETCHED | Word-sized graphics inline with numbers; small multiples. | Put the points sparkline in the standings row instead of a separate chart card. One stint strip per driver row in the results table. |
| Datawrapper tables / colours / colour-blindness: https://www.datawrapper.de/blog/guide-what-to-consider-when-creating-tables, https://www.datawrapper.de/blog/colors-for-data-vis-style-guides, https://www.datawrapper.de/academy/what-to-consider-when-choosing-colors-for-data-visualization, https://www.datawrapper.de/blog/colorblindness-part2 | FETCHED | Grey is the most important colour. About 7 colours at most. Highlight a few and grey the rest. Get it right in black and white. Encode twice. | In multi-driver charts, colour only the 2-3 in focus (favourites or selection). Separate similar team colours (Red Bull, Williams, Alpine blues) with dashes or markers. |
| FT Visual Vocabulary: https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary | FETCHED | Pick the chart by the relationship; stacked bars are poor for comparing components. | Progression = line or bump chart. Gap to leader = diverging bar. Win share = one horizontal meter, not donuts. |
| A List Apart, table typography: https://alistapart.com/article/web-typography-tables/ | FETCHED | Right-align numbers. `tabular-nums`. Horizontal rules only. | All lap times, gaps and points use `tabular-nums` and right alignment. |

## 8. Prediction markets and community feeds

| Source | Status | Principle | Application |
|---|---|---|---|
| Polymarket home: https://polymarket.com/ | FETCHED (partial; mostly JavaScript) | The probability is the hero of a market card. One secondary metric. "Live" only when true. | The prediction card leads with the question and the crowd split, with one metadata line. |
| Polymarket docs, orderbook: https://docs.polymarket.com/polymarket-learn/trading/using-the-orderbook | FETCHED | The displayed probability's computation is defined. | One line of help text says how the "community trend" % is computed (entries counted, podium = winner pick). |
| Kalshi, "How to read probabilities": https://news.kalshi.com/p/how-to-read-probabilities | FETCHED | Frame risk and reward together ("risking 25¢ to win 75¢"). | At entry, show "Stake 10 pts → win 20 pts if correct" once, not across three chips. |
| Manifold FAQ: https://docs.manifold.markets/faq | FETCHED | Exclusive states Open → Closed → Resolved (YES, NO or PARTIAL) or N/A (refund). Preview the payout before betting. | Define the exclusive state machine Open → Locked → Resolved (correct / partial / incorrect) or Void (refunded). Exactly one state indicator. |
| Reddit post header | FAILED (blocked); pattern from general knowledge, unverified | One muted metadata line; the title dominates; one quiet action row. | Post header = one muted line (community · author · time). A role tag only when it applies. |

---

## 9. Transferable principles for Apex F1 Hub

Each principle is referenced from [DESIGN_SYSTEM_SPEC.md](DESIGN_SYSTEM_SPEC.md) and [UI_CRITIQUE_AND_REDESIGN.md](UI_CRITIQUE_AND_REDESIGN.md) as **P1-P20**.

| # | Principle | Sources |
|---|---|---|
| P1 | Tables and lists for comparison; cards only for browsing mixed content | NN/g Cards, NN/g Data tables, F1 results and standings, ESPN |
| P2 | One state indicator per item, shown only when it matters; default states go unbadged | Atlassian Lozenge, NN/g Indicators, Primer StateLabel, Manifold, F1 calendar |
| P3 | Status badges and category chips are different components with different colour systems | Polaris, Atlassian |
| P4 | Emphasise by de-emphasising; about 3 type sizes per view; pass the squint test | NN/g Visual hierarchy, Refactoring UI |
| P5 | Spacing before containers; at most one container level inside a page section | Atlassian Spacing, Linear 2026 |
| P6 | Opaque tonal surfaces (lighter = higher), not glass | Apple HIG (search-only), NN/g Glassmorphism |
| P7 | A theme generated from a few perceptual tokens with contrast-guaranteed ramps | Linear 2024, Stripe colour |
| P8 | Red has one job: brand mark, primary action, or live state | F1 identity, Stripe Apps, Carbon |
| P9 | Navigation and rails recede; rails are contextual plain lists without promos | Linear 2026, NN/g Right-rail and Banner blindness |
| P10 | Answer first, detail on demand; at most 2 disclosure levels | Stripe Chart layout, NN/g Progressive disclosure, GOV.UK Details, F1 race hub |
| P11 | Dense tables done properly: tabular numbers, right alignment, hairlines, active-only sort icon, frozen first column | Carbon, A List Apart, NN/g Data tables |
| P12 | Charts live inside the data: sparklines, heat cells, stint strips | Tufte, Datawrapper, TracingInsights |
| P13 | Highlight a few and grey the rest; direct labels | Datawrapper, NN/g Clutter-free charts |
| P14 | Never colour alone: codes, signs, arrows, dashes | WCAG 1.4.1, 1.4.11; Datawrapper |
| P15 | Honest loading: nothing under about 1 s, skeletons only for data regions at final size, pending buttons | NN/g Skeletons, Stripe Loading, Carbon |
| P16 | Stable layout: fixed chart heights, image dimensions, no late inserts; CLS ≤0.1 | web.dev |
| P17 | Motion is optional and meaningful; reduced-motion guards on everything | WCAG 2.3.3, MDN |
| P18 | Accessibility baseline on dark: 4.5:1 text, 3:1 boundaries and focus, 24px targets, scroll-padding for sticky UI | WCAG 2.2 |
| P19 | One entity header pattern and one action area | Linear changelog, Stripe Action buttons |
| P20 | Sentence case by default; uppercase for one tier only | Carbon writing style, Atlassian |

## 10. Anti-patterns observed in Apex today (with source)

| Anti-pattern | Where in Apex | Source |
|---|---|---|
| Nested bordered panels | PredictionFeedCard (3 levels), RaceSectionCard → RaceSubSection → inset cards, CommunityRightRail | Atlassian Spacing, Linear, NN/g Progressive disclosure |
| Badge soup | Prediction cards: type badge + 3 meta chips + trend header count | NN/g Indicators, Atlassian |
| Uppercase tracked micro-labels as headings | 245 instances; RaceSectionCard titles are `<p>` | Carbon writing style |
| Glass and atmospheric layering without meaning | AmbientBackground streaks + grain + RotatingBackdrop + per-card backdrop blur | NN/g Glassmorphism |
| Red used for everything | 421 uses, 12+ meanings | Carbon, F1 identity |
| Overstuffed, duplicated right rails | RaceSidebar (7 blocks + Ask Apex promo), CommunityRightRail (4 cards, stats twice) | NN/g Right-rail |
| Promo card for the assistant | RaceSidebar "Ask Apex" card | NN/g Banner blindness |
| Height-animating content after mount | Trend bars, entry panel, 11 components | web.dev CLS |
| Motion without reduced-motion support | Lenis, backdrop crossfade, pulse skeletons | WCAG 2.3.3 |
| Faint borders as the only control boundary | Inputs at 1.43:1 | WCAG 1.4.11 |
