"use client";

import { Award, Flame, MessageSquarePlus, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export type WeekendReceiptData = {
  raceName: string;
  roundNumber?: number;
  crowdScore: number;
  apexScore: number;
  highlightTitle: string;
  highlightDescription: string;
  topPredictorName: string;
  topPredictorScore: string;
};

const DEFAULT_RECEIPT: WeekendReceiptData = {
  raceName: "Mexico City Grand Prix",
  roundNumber: 19,
  crowdScore: 3,
  apexScore: 1,
  highlightTitle: "Crowd beat Apex on Leclerc FP2 Pace",
  highlightDescription: "74% of community members predicted Ferrari top-2 while Apex model favoured McLaren long-runs.",
  topPredictorName: "Aditya Verma",
  topPredictorScore: "4/4 correct calls (100%)",
};

export function WeekendReceiptsCard({
  receipt = DEFAULT_RECEIPT,
  onShareToFeed,
}: {
  receipt?: WeekendReceiptData;
  onShareToFeed?: (receiptText: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const crowdWon = receipt.crowdScore > receipt.apexScore;

  function handleShare() {
    const summary = `🏆 [Weekend Receipts] ${receipt.raceName}: Communities ${receipt.crowdScore} - ${receipt.apexScore} Apex Model! "${receipt.highlightTitle}" — top predictor: ${receipt.topPredictorName} (${receipt.topPredictorScore})`;
    if (onShareToFeed) {
      onShareToFeed(summary);
    } else {
      void navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div
      role="region"
      aria-label="Weekend Receipts"
      className="overflow-hidden rounded-card border border-white/12 bg-surface-1/95 p-4 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-control bg-amber-500/10 text-amber-400">
            <Icon icon={Award} size={16} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-caption font-bold uppercase tracking-wider text-amber-400">Weekend Receipts</span>
              <span className="text-tertiary">·</span>
              <span className="text-caption font-semibold text-primary">{receipt.raceName}</span>
            </div>
            <p className="text-caption text-secondary">Community vs Apex Model debrief</p>
          </div>
        </div>

        {/* Score Pill */}
        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-caption tabular">
          <span className="flex items-center gap-1 font-semibold text-primary">
            <Icon icon={Users} size={16} className="size-3 text-tertiary" />
            {receipt.crowdScore}
          </span>
          <span className="text-tertiary">–</span>
          <span className="flex items-center gap-1 font-semibold text-primary">
            {receipt.apexScore}
            <Icon icon={Sparkles} size={16} className="size-3 text-cyan-400" />
          </span>
        </div>
      </div>

      {/* Main Upset Highlight */}
      <div className="mt-3 rounded-control border border-amber-500/20 bg-amber-500/[0.04] p-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-base">⚡</span>
          <div>
            <h4 className="text-caption font-bold text-amber-300">{receipt.highlightTitle}</h4>
            <p className="mt-0.5 text-caption text-secondary leading-relaxed">
              {receipt.highlightDescription}
            </p>
          </div>
        </div>
      </div>

      {/* Top Predictor MVP */}
      <div className="mt-3 flex items-center justify-between text-caption px-1">
        <div className="flex items-center gap-2">
          <Icon icon={Flame} size={16} className="size-4 text-brand" />
          <span className="text-secondary">Weekend MVP:</span>
          <span className="font-semibold text-primary">{receipt.topPredictorName}</span>
        </div>
        <span className="font-mono text-caption text-emerald-400 font-medium">
          {receipt.topPredictorScore}
        </span>
      </div>

      {/* Action footer */}
      <div className="mt-3 border-t border-white/[0.06] pt-2.5 flex items-center justify-between">
        <span className="text-caption text-tertiary">
          {crowdWon ? "🏆 Communities took round honours" : "Apex model edged this round"}
        </span>
        <button
          type="button"
          onClick={handleShare}
          className="flex items-center gap-1.5 rounded-control bg-white/[0.05] px-2.5 py-1 text-caption font-medium text-secondary transition-colors hover:bg-white/[0.1] hover:text-primary"
        >
          <Icon icon={MessageSquarePlus} size={16} className="size-3.5" />
          <span>{copied ? "Copied Receipt!" : "Drop Receipt to Feed"}</span>
        </button>
      </div>
    </div>
  );
}
