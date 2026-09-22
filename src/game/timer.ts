export function durationForProgress(answered: number): number {
  return Math.max(2800, 5000 - Math.max(0, answered) * 100);
}

/** Consume the full elapsed time; never grant extra time on a slow frame. */
export function consumeTime(remainingMs: number, elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return remainingMs;
  return Math.max(0, remainingMs - elapsedMs);
}
