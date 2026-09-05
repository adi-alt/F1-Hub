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

export interface HomepageIntelligence {
  raceBrief: {
    headline: string;
    whyItMatters: string;
    keyFactor: string;
  };
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
  if (obj.favoriteDriverInsight !== null && typeof obj.favoriteDriverInsight !== "string") {
    errors.push("favoriteDriverInsight must be a string or null");
  }

  // Validate favoriteTeamInsight (nullable)
  if (obj.favoriteTeamInsight !== null && typeof obj.favoriteTeamInsight !== "string") {
    errors.push("favoriteTeamInsight must be a string or null");
  }

  // Validate seasonNarrative
  if (typeof obj.seasonNarrative !== "string" || !obj.seasonNarrative.trim()) {
    errors.push("seasonNarrative must be a non-empty string");
  }

  // Validate communityPulse (nullable)
  if (obj.communityPulse !== null) {
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
  if (obj.predictionCoach !== null) {
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
    nextAction: {
      label: String((obj.nextAction as Record<string, unknown>).label || "Predict Upcoming Grand Prix"),
      actionType: validatedActionType,
    },
  };

  return { valid: true, data: validatedData };
}
