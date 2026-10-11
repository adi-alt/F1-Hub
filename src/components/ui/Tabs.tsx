"use client";

import { createContext, useContext, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

export type TabItem<V extends string = string> = {
  value: V;
  label: string;
  /** Shown after the label as a small tabular number, e.g. how many rows the tab holds. */
  count?: number;
};

export type TabsVariant = "underline" | "segmented";

type TabsContextValue = {
  baseId: string;
  variant: TabsVariant;
  value: string;
  onValueChange: (value: string) => void;
  items: readonly TabItem[];
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) throw new Error(`<${component}> must be rendered inside <Tabs>.`);
  return context;
}

// A tab's id and its panel's id both come from the one useId() base plus the tab's value, so
// aria-controls and aria-labelledby can't drift apart. encodeURIComponent stops a value with a space
// from splitting the id list, without letting two different values collide.
export function tabId(baseId: string, value: string): string {
  return `${baseId}-tab-${encodeURIComponent(value)}`;
}

export function tabPanelId(baseId: string, value: string): string {
  return `${baseId}-panel-${encodeURIComponent(value)}`;
}

/** The tab a key press moves to (APG tabs: Left/Right wrap around, Home/End jump to the ends), or
 * null for a key the tablist leaves alone. */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

const LIST_CLASS: Record<TabsVariant, string> = {
  // The list scrolls sideways on narrow screens. Its 4px padding keeps each tab's focus ring inside
  // the scroll area, which would otherwise clip it; -mx-1 puts the first label back on the edge.
  underline: "-mx-1 flex gap-6 overflow-x-auto px-1 py-1",
  segmented: "inline-flex max-w-full gap-1 overflow-x-auto rounded-control bg-surface-1 p-1",
};

const TAB_BASE = `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control text-body-sm font-medium transition-colors duration-fast ease-standard motion-reduce:transition-none ${FOCUS_RING}`;

const TAB_CLASS: Record<TabsVariant, { base: string; selected: string; idle: string }> = {
  underline: { base: "relative h-10", selected: "text-primary", idle: "text-secondary hover:text-primary" },
  // The ring gives the selected segment a 3:1 edge, so its state isn't carried by tone alone.
  segmented: { base: "h-7 px-3", selected: "bg-surface-2 text-primary ring-1 ring-inset ring-strong", idle: "text-secondary hover:text-primary" },
};

/**
 * Tabs, per the WAI-ARIA APG tabs pattern. Holds the selected value and the id base that ties each
 * tab to its panel: render a <TabList> where the strip goes and a <TabPanel> per item anywhere
 * inside, so the strip can sit in a header row away from its panels. `underline` is for page-level
 * tabs, `segmented` for small in-card toggles such as Drivers / Constructors.
 */
export function Tabs<V extends string>({
  variant = "underline",
  value,
  onValueChange,
  items,
  children,
}: {
  variant?: TabsVariant;
  value: V;
  onValueChange: (value: V) => void;
  items: readonly TabItem<V>[];
  /** The <TabList> and the <TabPanel>s, with any layout around them. */
  children: ReactNode;
}) {
  const baseId = useId();
  return <TabsContext value={{ baseId, variant, value, onValueChange: onValueChange as (value: string) => void, items }}>{children}</TabsContext>;
}

/**
 * The strip of tabs for the enclosing <Tabs>. Only the selected tab is in the Tab order (roving
 * tabindex); Left/Right move to and select the next tab (automatic activation), Home/End jump to the
 * ends. Needs a name: `aria-label`, or `aria-labelledby` pointing at a visible heading.
 * `className` is for layout only (width, flex or grid placement).
 */
export function TabList({ className = "", ...name }: { className?: string } & ({ "aria-label": string } | { "aria-labelledby": string })) {
  const { baseId, variant, value, onValueChange, items } = useTabsContext("TabList");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = items.findIndex((item) => item.value === value);
  // A value that matches no tab would leave nothing in the Tab order, so the first tab takes the stop.
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex;
  const styles = TAB_CLASS[variant];

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return; // e.g. Alt+Left is the browser's Back
    const next = nextTabIndex(event.key, index, items.length);
    if (next === null) return;
    event.preventDefault();
    tabRefs.current[next]?.focus();
    if (items[next].value !== value) onValueChange(items[next].value);
  }

  return (
    <div role="tablist" {...name} className={`${LIST_CLASS[variant]} ${className}`}>
      {items.map((item, index) => {
        const selected = index === selectedIndex;
        return (
          <button
            key={item.value}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={tabId(baseId, item.value)}
            aria-selected={selected}
            aria-controls={tabPanelId(baseId, item.value)}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => {
              if (!selected) onValueChange(item.value);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`${TAB_BASE} ${styles.base} ${selected ? styles.selected : styles.idle}`}
          >
            {item.label}
            {item.count !== undefined && <span className="text-caption tabular text-tertiary">{item.count}</span>}
            {variant === "underline" && (
              <span
                aria-hidden
                className={`absolute inset-x-0 bottom-0 h-0.5 bg-brand transition-transform duration-base ease-standard motion-reduce:transition-none ${selected ? "scale-x-100" : "scale-x-0"}`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The content of one tab of the enclosing <Tabs>. Always in the DOM so every tab's aria-controls
 * resolves, but hidden and empty unless its tab is selected. Focusable (tabIndex 0, per the APG) so
 * keyboard users can reach a panel with no controls in it. `className` is for layout only.
 */
export function TabPanel({ value, className = "", children }: { value: string; className?: string; children: ReactNode }) {
  const { baseId, value: selectedValue } = useTabsContext("TabPanel");
  const selected = value === selectedValue;
  return (
    <div
      role="tabpanel"
      id={tabPanelId(baseId, value)}
      aria-labelledby={tabId(baseId, value)}
      tabIndex={0}
      hidden={!selected}
      className={`${FOCUS_RING} ${className}`}
    >
      {selected ? children : null}
    </div>
  );
}

/**
 * A <TabPanel> for every tab of the enclosing <Tabs>, all given the same `children`, so only the
 * selected one shows them. For content written once against the selected value rather than once
 * per tab: a filter over one table, a metric over one chart, a list of tabs that comes from data.
 * `className` goes on each panel and is for layout only.
 */
export function TabPanels({ className, children }: { className?: string; children: ReactNode }) {
  const { items } = useTabsContext("TabPanels");
  return items.map((item) => (
    <TabPanel key={item.value} value={item.value} className={className}>
      {children}
    </TabPanel>
  ));
}
