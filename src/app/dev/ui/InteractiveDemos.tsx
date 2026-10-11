"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Dialog, Sheet } from "@/components/ui/Dialog";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { Select, TextInput } from "@/components/ui/Field";
import { Table, type TableColumn } from "@/components/ui/Table";
import { TabList, TabPanel, Tabs } from "@/components/ui/Tabs";

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

/** Page-level underline tabs, and an in-card segmented toggle. */
export function TabsDemo() {
  const [page, setPage] = useState<"overview" | "results" | "strategy">("results");
  const [table, setTable] = useState<"drivers" | "constructors">("drivers");
  return (
    <div className="flex flex-col gap-6">
      <Tabs
        value={page}
        onValueChange={setPage}
        items={[
          { value: "overview", label: "Overview" },
          { value: "results", label: "Results", count: 22 },
          { value: "strategy", label: "Strategy" },
        ]}
      >
        <TabList aria-label="Race sections" />
        <TabPanel value="overview" className="pt-3 text-body-sm text-secondary">
          The weekend at a glance.
        </TabPanel>
        <TabPanel value="results" className="pt-3 text-body-sm text-secondary">
          The classification. Arrow keys move between tabs; Home and End jump to the ends.
        </TabPanel>
        <TabPanel value="strategy" className="pt-3 text-body-sm text-secondary">
          Tyre stints and pit stops.
        </TabPanel>
      </Tabs>
      <Tabs
        variant="segmented"
        value={table}
        onValueChange={setTable}
        items={[
          { value: "drivers", label: "Drivers" },
          { value: "constructors", label: "Constructors" },
        ]}
      >
        <TabList aria-label="Standings" />
        <TabPanel value="drivers" className="pt-3 text-body-sm text-secondary">
          Driver standings.
        </TabPanel>
        <TabPanel value="constructors" className="pt-3 text-body-sm text-secondary">
          Constructor standings.
        </TabPanel>
      </Tabs>
    </div>
  );
}

type StandingRow = { code: string; name: string; team: string; wins: number; points: number };

const STANDINGS: StandingRow[] = [
  { code: "ANT", name: "Kimi Antonelli", team: "Mercedes", wins: 4, points: 302 },
  { code: "RUS", name: "George Russell", team: "Mercedes", wins: 3, points: 236 },
  { code: "HAM", name: "Lewis Hamilton", team: "Ferrari", wins: 2, points: 199 },
  { code: "NOR", name: "Lando Norris", team: "McLaren", wins: 2, points: 186 },
  { code: "LEC", name: "Charles Leclerc", team: "Ferrari", wins: 1, points: 179 },
];

const STANDING_COLUMNS: TableColumn<StandingRow>[] = [
  { key: "name", header: "Driver", sortable: true },
  { key: "team", header: "Team" },
  { key: "wins", header: "Wins", numeric: true, sortable: true },
  { key: "points", header: "Points", numeric: true, sortable: true },
];

/** A sortable, expandable standings table whose rows can be activated. */
export function TableDemo() {
  const [activated, setActivated] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <Table
        caption="Driver standings (sample data)"
        columns={STANDING_COLUMNS}
        rows={STANDINGS}
        getRowKey={(row) => row.code}
        defaultSort={{ key: "points", direction: "descending" }}
        stickyFirstColumn
        onRowActivate={(row) => setActivated(row.name)}
        expandable
        renderExpanded={(row) => (
          <p className="text-body-sm text-secondary">
            {row.name} ({row.code}) has {row.wins} wins for {row.team}.
          </p>
        )}
      />
      <p className="text-body-sm text-tertiary" aria-live="polite">
        {activated ? `Activated: ${activated}` : "Click a row, or focus it and press Enter or Space."}
      </p>
    </div>
  );
}

/** Text and select fields with hints and an error. */
export function FieldDemo() {
  const [username, setUsername] = useState("ab");
  const tooShort = username.trim().length < 3;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextInput label="Username" hint="3-20 letters, numbers or underscores." error={tooShort ? "Use at least 3 characters." : undefined} value={username} onChange={(e) => setUsername(e.target.value)} />
      <Select label="Favourite team" hint="Shown on your profile." defaultValue="ferrari">
        <option value="ferrari">Ferrari</option>
        <option value="mclaren">McLaren</option>
        <option value="mercedes">Mercedes</option>
      </Select>
    </div>
  );
}

/** A confirmation dialog and a filter sheet. */
export function OverlayDemo() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" size="md" onClick={() => setDialogOpen(true)}>
        Open dialog
      </Button>
      <Button variant="secondary" size="md" onClick={() => setSheetOpen(true)}>
        Open sheet
      </Button>
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Leave this community?"
        description="You can rejoin later; your predictions stay in the season history."
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="md" onClick={() => setDialogOpen(false)}>
              Leave community
            </Button>
          </>
        }
      >
        <p className="text-secondary">Escape, the scrim and the close button all close it, and focus returns to the button that opened it.</p>
      </Dialog>
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filters" description="A bottom sheet on phones, a right-hand panel from md up.">
        <ChipDemo />
      </Sheet>
    </div>
  );
}

function ToastButtons() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" size="sm" onClick={() => toast.show({ message: "Qualifying starts in 30 minutes." })}>
        Info
      </Button>
      <Button variant="secondary" size="sm" onClick={() => toast.show({ tone: "success", message: "Prediction saved." })}>
        Success
      </Button>
      <Button variant="secondary" size="sm" onClick={() => toast.show({ tone: "warning", message: "These results are preliminary." })}>
        Warning
      </Button>
      <Button variant="secondary" size="sm" onClick={() => toast.show({ tone: "danger", message: "Couldn't post your comment.", description: "Errors stay until dismissed." })}>
        Error
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          const id = toast.show({
            message: "Post deleted.",
            action: (
              <Button variant="ghost" size="sm" onClick={() => toast.dismiss(id)}>
                Undo
              </Button>
            ),
          });
        }}
      >
        With an action
      </Button>
    </div>
  );
}

/** Toasts in each tone; ordinary ones leave after 5 s, errors and ones with an action stay. */
export function ToastDemo() {
  return (
    <ToastProvider>
      <ToastButtons />
    </ToastProvider>
  );
}
