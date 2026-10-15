// Shared bits of entering a prediction round from the feed. The entry itself now lives in PredictionFeedCard (the
// market card's tiles and its Confirm), which posts to the same endpoint the community's Predictions tab uses.

export type DriverOption = { code: string; name: string; headshotUrl: string | null };

export const CLOSED_MESSAGE = "Predictions closed when qualifying began.";
export const DEADLINE_UNKNOWN_MESSAGE = "This round's deadline isn't available yet, so it can't take entries right now.";
