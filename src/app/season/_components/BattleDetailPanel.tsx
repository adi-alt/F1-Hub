import { XIcon } from "lucide-react";
import type { Battle } from "../_service/season.service";

export function BattleDetailPanel({
  battle,
  onClose,
}: {
  battle: Battle | null;
  onClose: () => void;
}) {
  if (!battle) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-[var(--f1-card)] border-l border-[var(--f1-border)] shadow-2xl z-50 transform transition-transform overflow-y-auto">
      <div className="sticky top-0 bg-[var(--f1-card)]/90 backdrop-blur-md p-4 border-b border-[var(--f1-border)] flex justify-between items-center z-10">
        <h3 className="font-black text-xl italic uppercase text-[var(--f1-text)]">
          Head-to-Head
        </h3>
        <button
          onClick={onClose}
          className="p-2 hover:bg-[var(--f1-muted)] rounded-full transition-colors text-[var(--f1-text-muted)] hover:text-[var(--f1-text)]"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6">
        <div className="flex items-center justify-between mb-8">
          <div className="text-center flex-1">
            <p className="text-xs uppercase font-semibold text-[var(--f1-text-muted)] tracking-wider mb-1">{battle.aId}</p>
            <p className="text-3xl font-black text-[var(--f1-text)]">{battle.aValue}</p>
            <p className="text-sm font-semibold text-[var(--f1-accent)]">PTS</p>
          </div>
          
          <div className="px-4 py-2 bg-[var(--f1-muted)] rounded-lg text-center">
            <p className="text-sm font-bold text-[var(--f1-text)]">GAP</p>
            <p className="text-xl font-black text-[var(--f1-red)]">{battle.gap}</p>
          </div>

          <div className="text-center flex-1">
            <p className="text-xs uppercase font-semibold text-[var(--f1-text-muted)] tracking-wider mb-1">{battle.bId}</p>
            <p className="text-3xl font-black text-[var(--f1-text)]">{battle.bValue}</p>
            <p className="text-sm font-semibold text-[var(--f1-accent)]">PTS</p>
          </div>
        </div>

        {battle.h2h && (
          <div className="bg-[var(--f1-bg)] border border-[var(--f1-border)] rounded-xl p-5 mb-6">
            <h4 className="font-bold text-[var(--f1-text)] mb-4 uppercase tracking-wide text-sm">Race Finish Head-to-Head</h4>
            
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-[var(--f1-text)]">{battle.aLabel}</span>
              <span className="text-2xl font-black">{battle.h2h.aWins}</span>
            </div>
            
            <div className="flex justify-between items-center mb-4">
              <span className="font-semibold text-[var(--f1-text)]">{battle.bLabel}</span>
              <span className="text-2xl font-black">{battle.h2h.bWins}</span>
            </div>
            
            <div className="text-sm text-[var(--f1-text-muted)] pt-3 border-t border-[var(--f1-border)] flex justify-between">
              <span>Ties: {battle.h2h.ties}</span>
              <span>Comparable Rounds: {battle.h2h.comparableRounds}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
