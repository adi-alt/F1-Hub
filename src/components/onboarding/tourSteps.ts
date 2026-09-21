/** A step targets a real element by its `data-tour` attribute. There are no synthetic targets and
 * no fabricated copy: every step below describes functionality that exists in this app today. */
export type TourStep = {
  id: string;
  /** Matched as [data-tour="..."]. A step whose target isn't on the page is skipped, not faked. */
  target: string;
  title: string;
  body: string;
  /** Communities-homepage steps only run there; global steps run anywhere the nav exists. */
  scope: "global" | "communities";
};

/**
 * The tour, in order.
 *
 * Deliberately short. The brief's own instruction was to keep the first run concise, so the global
 * pass is one step per destination rather than one per feature, and the Communities pass only runs
 * when the viewer is actually looking at that page.
 *
 * Copy describes what each area really does - checked against the routes and components in this
 * repo, not written from the names. Nothing here promises a capability the app doesn't have.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    target: "global-nav",
    scope: "global",
    title: "Welcome to F1 Hub",
    body: "Everything lives behind this nav: the season, the circuits, the archive, your communities and Apex. Here's a quick look at each.",
  },
  {
    id: "season",
    target: "nav-season",
    scope: "global",
    title: "Season",
    body: "Follow the championship as it runs - the calendar, standings, race results and season-level analysis for every round.",
  },
  {
    id: "circuits",
    target: "nav-circuits",
    scope: "global",
    title: "Circuits",
    body: "Every track on its own terms: layout, characteristics, past winners and how the current weekend fits its history.",
  },
  {
    id: "archive",
    target: "nav-archive",
    scope: "global",
    title: "Archive",
    body: "Past seasons and races, searchable by driver, team or circuit - results and history going back well before the live data.",
  },
  {
    id: "communities",
    target: "nav-communities",
    scope: "global",
    title: "Communities",
    body: "The social side. Join communities, post and reply, vote on discussions, and enter prediction rounds run by the communities you're in.",
  },
  {
    id: "apex",
    target: "apex-launcher",
    scope: "global",
    title: "Ask Apex",
    body: "Apex answers from the data on the page you're on - the race, the circuit, your communities - rather than from the open web.",
  },
  {
    id: "community-filter",
    target: "community-filter",
    scope: "communities",
    title: "Your feed scope",
    body: "All communities shows everything you follow in one stream. Pick a single community to narrow the feed to it.",
  },
  {
    id: "community-list",
    target: "community-list",
    scope: "communities",
    title: "Your communities",
    body: "The communities you've joined. Selecting one switches the feed in place; the chevron opens that community's own page.",
  },
  {
    id: "composer",
    target: "create-post",
    scope: "communities",
    title: "Start something",
    body: "Write a post, attach media, add a GIF or emoji, pick where it publishes, get Apex to help you word it, or schedule it for later.",
  },
  {
    id: "feed-tabs",
    target: "feed-tabs",
    scope: "communities",
    title: "Following, For You, Latest",
    body: "Following is the communities you've joined. For You and Latest widen to public communities and personal posts as well.",
  },
  {
    id: "post",
    target: "post",
    scope: "communities",
    title: "Reading the feed",
    body: "C/ is the community a post lives in, U/ is the person who wrote it. Vote, open the discussion, or share a link to it.",
  },
  {
    id: "race-rail",
    target: "race-weekend",
    scope: "communities",
    title: "Race-weekend context",
    body: "The next round, Apex's read on the circuit, your open predictions and what's changed in your communities since you were last here.",
  },
];
