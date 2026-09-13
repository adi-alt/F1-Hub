// Prediction Fingerprint Schema — Deterministic metrics calculated in application code
// paired with a grounded 1-2 sentence AI interpretation.

export interface PredictionFingerprint {
  winnerAccuracy: number; // calculated by app code (0-100)
  podiumAccuracy: number; // calculated by app code (0-100)
  avgPositionError: number; // calculated by app code (lower is better)
  totalPredictions: number; // calculated by app code
  aiInterpretation: string; // The model's 1-2 sentence interpretation
}

export function validatePredictionFingerprint(
  input: unknown,
): { valid: boolean; data?: PredictionFingerprint; errors?: string[] } {
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["Invalid fingerprint payload"] };
  }
  const obj = input as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof obj.winnerAccuracy !== "number") errors.push("winnerAccuracy must be a number");
  if (typeof obj.podiumAccuracy !== "number") errors.push("podiumAccuracy must be a number");
  if (typeof obj.avgPositionError !== "number") errors.push("avgPositionError must be a number");
  if (typeof obj.totalPredictions !== "number") errors.push("totalPredictions must be a number");
  if (typeof obj.aiInterpretation !== "string" || !obj.aiInterpretation.trim()) {
    errors.push("aiInterpretation must be a non-empty string");
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      winnerAccuracy: Number(obj.winnerAccuracy),
      podiumAccuracy: Number(obj.podiumAccuracy),
      avgPositionError: Number(obj.avgPositionError),
      totalPredictions: Number(obj.totalPredictions),
      aiInterpretation: String(obj.aiInterpretation),
    },
  };
}
