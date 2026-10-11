"use client";

import type { ReactNode } from "react";
import { EntityMultiSelect, type MultiSelectOption } from "@/app/season/_components/EntityMultiSelect";
import { TabList, TabPanels, Tabs, type TabItem } from "@/components/ui/Tabs";
import type { DriverSet } from "@/lib/driverSet";

const DRIVER_SET_TABS: TabItem<DriverSet>[] = [
  { value: "top5", label: "Top 5" },
  { value: "top10", label: "Top 10" },
  { value: "all", label: "All drivers" },
  { value: "custom", label: "Custom" },
];

/**
 * The Top 5 / Top 10 / All drivers / Custom filter the race pages put over their driver charts, as
 * segmented tabs: a compact filter, not navigation. DriverSetTabs goes around the whole section,
 * DriverSetFilter where the strip sits and DriverSetPanels around what it filters. A field of five
 * or fewer leaves nothing to filter, so callers leave DriverSetFilter out and pass
 * `filterable={false}` to DriverSetPanels: no strip, and no panels pointing at tabs that aren't there.
 */
export function DriverSetTabs({ value, onValueChange, children }: { value: DriverSet; onValueChange: (value: DriverSet) => void; children: ReactNode }) {
  return (
    <Tabs variant="segmented" value={value} onValueChange={onValueChange} items={DRIVER_SET_TABS}>
      {children}
    </Tabs>
  );
}

/** The strip, and the driver picker beside it while Custom is selected. */
export function DriverSetFilter({
  value,
  customOptions,
  customIds,
  onCustomIdsChange,
}: {
  value: DriverSet;
  customOptions: MultiSelectOption[];
  customIds: string[];
  onCustomIdsChange: (ids: string[]) => void;
}) {
  return (
    // min-w-0 lets the strip scroll sideways in a narrow section header instead of widening it.
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <TabList aria-label="Drivers shown" />
      {value === "custom" && (
        <EntityMultiSelect options={customOptions} selected={customIds} onChange={onCustomIdsChange} placeholder="Select drivers" triggerClassName="h-8 py-1 text-xs" />
      )}
    </div>
  );
}

/** What the strip filters, in a panel per tab; only the content when there's no strip. */
export function DriverSetPanels({ filterable, children }: { filterable: boolean; children: ReactNode }) {
  return filterable ? <TabPanels>{children}</TabPanels> : children;
}
