// Homepage Intelligence Schema & Validation.
// Single bundled schema for all homepage intelligence widgets.
// Guarantees strictly validated structure with zero arbitrary HTML, URLs, or client-side control.

export const ALLOWED_ACTION_TYPES = [
  "MAKE_PREDICTION",
  "EXPLORE_RACE",
  "JOIN_COMMUNITY",
  "VIEW_MODEL",
  "CHOOSE_FAVORITES",
] as const;

export type NextActionType = (typeof ALLOWED_ACTION_TYPES)[number];

export const PREDICTION_CHALLENGE_STATUSES = ["AGREE", "DISAGREE", "NO_PICK"] as const;
export type PredictionChallengeStatus = (typeof PREDICTION_CHALLENGE_STATUSES)[number];

export const SINCE_LAST_VISIT_CHANGE_TYPES = ["DRIVER", "TEAM", "CHAMPIONSHIP", "PREDICTION", "COMMUNITY", "MODEL"] as const;
export type SinceLastVisitChangeType = (typeof SINCE_LAST_VISIT_CHANGE_TYPES)[number];

export interface HomepageIntelligence {
  raceBrief: {
    headline: string;
    whyItMatters: string;
    keyFactor: string;
  };
  /** Null for a guest or a signed-in user with no favorites - never synthesized without real
   * favorite-driver/team context to ground it in (see context.ts's PERSONAL_CONTEXT block). */
  personalRaceBrief: {
    headline: string;
    whyItMatters: string;
    favoriteDriverAngle: string | null;
    favoriteTeamAngle: string | null;
  } | null;
  oneThingToWatch: {
    topic: string;
    explanation: string;
  };
  biggestUncertainty: {
    title: string;
    explanation: string;
  };
  favoriteDriverInsight: string | null;
  favoriteTeamInsight: string | null;
  seasonNarrative: string;
  communityPulse: {
    topics: string[];
    mostDiscussed: string;
    summary: string;
  } | null;
  predictionCoach: {
    analysis: string;
    tendency: string;
  } | null;
  /** Null when the user hasn't made a pick for this race - "NO_PICK" isn't a synthesized status,
   * it's what the route sets deterministically before ever asking Kimi to fill in an explanation. */
  predictionChallenge: {
    status: PredictionChallengeStatus;
    explanation: string;
    strongestEvidenceForUser: string;
    strongestEvidenceAgainstUser: string;
  } | null;
  /** Driver-specific synthesis for the hero's Race Intelligence panel - championship position,
   * this circuit's history for them, and what the model says, woven into one assessment. Null
   * without a favorite driver. */
  personalOutlook: {
    driver: string;
    championshipContext: string;
    circuitContext: string;
    modelContext: string;
    overallAssessment: string;
  } | null;
  /** Null when there's no prior visit to diff against (sinceLastVisit.hasPriorVisit === false) -
   * the route never asks Kimi to fabricate a "nothing changed" summary for a first-time visitor. */
  sinceLastVisit: {
    changes: Array<{ type: SinceLastVisitChangeType; title: string; explanation: string }>;
    summary: string;
  } | null;
  nextAction: {
    label: string;
    actionType: NextActionType;
  };
}

export function isValidActionType(val: unknown): val is NextActionType {
  return typeof val === "string" && (ALLOWED_ACTION_TYPES as readonly string[]).includes(val);
}

export function validateHomepageIntelligence(
  input: unknown,
): { valid: boolean; data?: HomepageIntelligence; errors?: string[] } {
  const errors: string[] = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["Input must be a non-null object"] };
  }

  const obj = input as Record<string, unknown>;

  // Validate raceBrief
  if (!obj.raceBrief || typeof obj.raceBrief !== "object") {
    errors.push("Missing or invalid raceBrief");
  } else {
    const rb = obj.raceBrief as Record<string, unknown>;
    if (typeof rb.headline !== "string" || !rb.headline.trim()) {
      errors.push("raceBrief.headline must be a non-empty string");
    }
    if (typeof rb.whyItMatters !== "string" || !rb.whyItMatters.trim()) {
      errors.push("raceBrief.whyItMatters must be a non-empty string");
    }
    if (typeof rb.keyFactor !== "string" || !rb.keyFactor.trim()) {
      errors.push("raceBrief.keyFactor must be a non-empty string");
    }
  }

  // Validate personalRaceBrief (nullable - a missing key is treated the same as an explicit null,
  // since an older/simpler payload or a guest-shaped response may simply omit it)
  if (obj.personalRaceBrief != null) {
    if (typeof obj.personalRaceBrief !== "object" || Array.isArray(obj.personalRaceBrief)) {
      errors.push("personalRaceBrief must be an object or null");
    } else {
      const prb = obj.personalRaceBrief as Record<string, unknown>;
      if (typeof prb.headline !== "string" || !prb.headline.trim()) errors.push("personalRaceBrief.headline must be a non-empty string");
      if (typeof prb.whyItMatters !== "string" || !prb.whyItMatters.trim()) errors.push("personalRaceBrief.whyItMatters must be a non-empty string");
      if (prb.favoriteDriverAngle != null && typeof prb.favoriteDriverAngle !== "string") errors.push("personalRaceBrief.favoriteDriverAngle must be a string or null");
      if (prb.favoriteTeamAngle != null && typeof prb.favoriteTeamAngle !== "string") errors.push("personalRaceBrief.favoriteTeamAngle must be a string or null");
    }
  }

  // Validate oneThingToWatch
  if (!obj.oneThingToWatch || typeof obj.oneThingToWatch !== "object") {
    errors.push("Missing or invalid oneThingToWatch");
  } else {
    const otw = obj.oneThingToWatch as Record<string, unknown>;
    if (typeof otw.topic !== "string" || !otw.topic.trim()) {
      errors.push("oneThingToWatch.topic must be a non-empty string");
    }
    if (typeof otw.explanation !== "string" || !otw.explanation.trim()) {
      errors.push("oneThingToWatch.explanation must be a non-empty string");
    }
  }

  // Validate biggestUncertainty
  if (!obj.biggestUncertainty || typeof obj.biggestUncertainty !== "object") {
    errors.push("Missing or invalid biggestUncertainty");
  } else {
    const bu = obj.biggestUncertainty as Record<string, unknown>;
    if (typeof bu.title !== "string" || !bu.title.trim()) {
      errors.push("biggestUncertainty.title must be a non-empty string");
    }
    if (typeof bu.explanation !== "string" || !bu.explanation.trim()) {
      errors.push("biggestUncertainty.explanation must be a non-empty string");
    }
  }

  // Validate favoriteDriverInsight (nullable)
  if (obj.favoriteDriverInsight != null && typeof obj.favoriteDriverInsight !== "string") {
    errors.push("favoriteDriverInsight must be a string or null");
  }

  // Validate favoriteTeamInsight (nullable)
  if (obj.favoriteTeamInsight != null && typeof obj.favoriteTeamInsight !== "string") {
    errors.push("favoriteTeamInsight must be a string or null");
  }

  // Validate seasonNarrative
  if (typeof obj.seasonNarrative !== "string" || !obj.seasonNarrative.trim()) {
    errors.push("seasonNarrative must be a non-empty string");
  }

  // Validate communityPulse (nullable)
  if (obj.communityPulse != null) {
    if (typeof obj.communityPulse !== "object" || Array.isArray(obj.communityPulse)) {
      errors.push("communityPulse must be an object or null");
    } else {
      const cp = obj.communityPulse as Record<string, unknown>;
      if (!Array.isArray(cp.topics) || cp.topics.some((t) => typeof t !== "string")) {
        errors.push("communityPulse.topics must be an array of strings");
      }
      if (typeof cp.mostDiscussed !== "string") {
        errors.push("communityPulse.mostDiscussed must be a string");
      }
      if (typeof cp.summary !== "string") {
        errors.push("communityPulse.summary must be a string");
      }
    }
  }

  // Validate predictionCoach (nullable)
  if (obj.predictionCoach != null) {
    if (typeof obj.predictionCoach !== "object" || Array.isArray(obj.predictionCoach)) {
      errors.push("predictionCoach must be an object or null");
    } else {
      const pc = obj.predictionCoach as Record<string, unknown>;
      if (typeof pc.analysis !== "string") {
        errors.push("predictionCoach.analysis must be a string");
      }
      if (typeof pc.tendency !== "string") {
        errors.push("predictionCoach.tendency must be a string");
      }
    }
  }

  // Validate predictionChallenge (nullable)
  if (obj.predictionChallenge != null) {
    if (typeof obj.predictionChallenge !== "object" || Array.isArray(obj.predictionChallenge)) {
      errors.push("predictionChallenge must be an object or null");
    } else {
      const pc = obj.predictionChallenge as Record<string, unknown>;
      if (!PREDICTION_CHALLENGE_STATUSES.includes(pc.status as PredictionChallengeStatus)) errors.push("predictionChallenge.status must be AGREE, DISAGREE, or NO_PICK");
      if (typeof pc.explanation !== "string") errors.push("predictionChallenge.explanation must be a string");
      if (typeof pc.strongestEvidenceForUser !== "string") errors.push("predictionChallenge.strongestEvidenceForUser must be a string");
      if (typeof pc.strongestEvidenceAgainstUser !== "string") errors.push("predictionChallenge.strongestEvidenceAgainstUser must be a string");
    }
  }

  // Validate personalOutlook (nullable)
  if (obj.personalOutlook != null) {
    if (typeof obj.personalOutlook !== "object" || Array.isArray(obj.personalOutlook)) {
      errors.push("personalOutlook must be an object or null");
    } else {
      const po = obj.personalOutlook as Record<string, unknown>;
      if (typeof po.driver !== "string" || !po.driver.trim()) errors.push("personalOutlook.driver must be a non-empty string");
      if (typeof po.championshipContext !== "string") errors.push("personalOutlook.championshipContext must be a string");
      if (typeof po.circuitContext !== "string") errors.push("personalOutlook.circuitContext must be a string");
      if (typeof po.modelContext !== "string") errors.push("personalOutlook.modelContext must be a string");
      if (typeof po.overallAssessment !== "string") errors.push("personalOutlook.overallAssessment must be a string");
    }
  }

  // Validate sinceLastVisit (nullable)
  if (obj.sinceLastVisit != null) {
    if (typeof obj.sinceLastVisit !== "object" || Array.isArray(obj.sinceLastVisit)) {
      errors.push("sinceLastVisit must be an object or null");
    } else {
      const slv = obj.sinceLastVisit as Record<string, unknown>;
      if (!Array.isArray(slv.changes)) {
        errors.push("sinceLastVisit.changes must be an array");
      } else {
        for (const c of slv.changes) {
          if (!c || typeof c !== "object" || typeof (c as Record<string, unknown>).title !== "string" || typeof (c as Record<string, unknown>).explanation !== "string") {
            errors.push("sinceLastVisit.changes entries must have title/explanation strings");
            break;
          }
        }
      }
      if (typeof slv.summary !== "string") errors.push("sinceLastVisit.summary must be a string");
    }
  }

  // Validate nextAction
  let validatedActionType: NextActionType = "MAKE_PREDICTION";
  if (!obj.nextAction || typeof obj.nextAction !== "object") {
    errors.push("Missing nextAction object");
  } else {
    const na = obj.nextAction as Record<string, unknown>;
    if (typeof na.label !== "string" || !na.label.trim()) {
      errors.push("nextAction.label must be a non-empty string");
    }
    if (!isValidActionType(na.actionType)) {
      // Coerce invalid actionType to default rather than rejecting the whole payload
      validatedActionType = "MAKE_PREDICTION";
    } else {
      validatedActionType = na.actionType;
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const validatedData: HomepageIntelligence = {
    raceBrief: {
      headline: String((obj.raceBrief as Record<string, unknown>).headline),
      whyItMatters: String((obj.raceBrief as Record<string, unknown>).whyItMatters),
      keyFactor: String((obj.raceBrief as Record<string, unknown>).keyFactor),
    },
    personalRaceBrief:
      obj.personalRaceBrief && typeof obj.personalRaceBrief === "object"
        ? {
            headline: String((obj.personalRaceBrief as Record<string, unknown>).headline),
            whyItMatters: String((obj.personalRaceBrief as Record<string, unknown>).whyItMatters),
            favoriteDriverAngle: typeof (obj.personalRaceBrief as Record<string, unknown>).favoriteDriverAngle === "string" ? ((obj.personalRaceBrief as Record<string, unknown>).favoriteDriverAngle as string) : null,
            favoriteTeamAngle: typeof (obj.personalRaceBrief as Record<string, unknown>).favoriteTeamAngle === "string" ? ((obj.personalRaceBrief as Record<string, unknown>).favoriteTeamAngle as string) : null,
          }
        : null,
    oneThingToWatch: {
      topic: String((obj.oneThingToWatch as Record<string, unknown>).topic),
      explanation: String((obj.oneThingToWatch as Record<string, unknown>).explanation),
    },
    biggestUncertainty: {
      title: String((obj.biggestUncertainty as Record<string, unknown>).title),
      explanation: String((obj.biggestUncertainty as Record<string, unknown>).explanation),
    },
    favoriteDriverInsight:
      typeof obj.favoriteDriverInsight === "string" ? obj.favoriteDriverInsight : null,
    favoriteTeamInsight:
      typeof obj.favoriteTeamInsight === "string" ? obj.favoriteTeamInsight : null,
    seasonNarrative: String(obj.seasonNarrative),
    communityPulse:
      obj.communityPulse && typeof obj.communityPulse === "object"
        ? {
            topics: ((obj.communityPulse as Record<string, unknown>).topics as string[]).slice(0, 5),
            mostDiscussed: String((obj.communityPulse as Record<string, unknown>).mostDiscussed),
            summary: String((obj.communityPulse as Record<string, unknown>).summary),
          }
        : null,
    predictionCoach:
      obj.predictionCoach && typeof obj.predictionCoach === "object"
        ? {
            analysis: String((obj.predictionCoach as Record<string, unknown>).analysis),
            tendency: String((obj.predictionCoach as Record<string, unknown>).tendency),
          }
        : null,
    predictionChallenge:
      obj.predictionChallenge && typeof obj.predictionChallenge === "object"
        ? {
            status: PREDICTION_CHALLENGE_STATUSES.includes((obj.predictionChallenge as Record<string, unknown>).status as PredictionChallengeStatus)
              ? ((obj.predictionChallenge as Record<string, unknown>).status as PredictionChallengeStatus)
              : "NO_PICK",
            explanation: String((obj.predictionChallenge as Record<string, unknown>).explanation),
            strongestEvidenceForUser: String((obj.predictionChallenge as Record<string, unknown>).strongestEvidenceForUser),
            strongestEvidenceAgainstUser: String((obj.predictionChallenge as Record<string, unknown>).strongestEvidenceAgainstUser),
          }
        : null,
    personalOutlook:
      obj.personalOutlook && typeof obj.personalOutlook === "object"
        ? {
            driver: String((obj.personalOutlook as Record<string, unknown>).driver),
            championshipContext: String((obj.personalOutlook as Record<string, unknown>).championshipContext),
            circuitContext: String((obj.personalOutlook as Record<string, unknown>).circuitContext),
            modelContext: String((obj.personalOutlook as Record<string, unknown>).modelContext),
            overallAssessment: String((obj.personalOutlook as Record<string, unknown>).overallAssessment),
          }
        : null,
    sinceLastVisit:
      obj.sinceLastVisit && typeof obj.sinceLastVisit === "object"
        ? {
            changes: ((obj.sinceLastVisit as Record<string, unknown>).changes as Array<Record<string, unknown>>).slice(0, 6).map((c) => ({
              type: SINCE_LAST_VISIT_CHANGE_TYPES.includes(c.type as SinceLastVisitChangeType) ? (c.type as SinceLastVisitChangeType) : "MODEL",
              title: String(c.title),
              explanation: String(c.explanation),
            })),
            summary: String((obj.sinceLastVisit as Record<string, unknown>).summary),
          }
        : null,
    nextAction: {
      label: String((obj.nextAction as Record<string, unknown>).label || "Predict Upcoming Grand Prix"),
      actionType: validatedActionType,
    },
  };

  return { valid: true, data: validatedData };
}
