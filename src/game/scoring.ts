export function multiplierForStreak(streak: number): number {
  return Math.min(4, 1 + Math.floor(Math.max(0, streak) / 5));
}

/** Streak includes this correct answer; quicker responses earn up to 50 bonus points. */
export function pointsForAnswer(streak: number, remainingMs: number, durationMs: number): number {
  const fraction = durationMs > 0 ? Math.max(0, Math.min(1, remainingMs / durationMs)) : 0;
  return (100 + Math.floor(fraction * 50)) * multiplierForStreak(streak);
}

export function accuracyPercent(correct: number, answered: number): number {
  return answered > 0 ? Math.round((correct / answered) * 100) : 0;
}

export function betterHighScore(current: number, candidate: number): number {
  const safe = (value: number) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return Math.max(safe(current), safe(candidate));
}
