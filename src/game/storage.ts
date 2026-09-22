import { betterHighScore } from './scoring';
export { betterHighScore } from './scoring';

export interface Preferences {
  muted: boolean;
  haptics: boolean;
  tutorialSeen: boolean;
}

const PREFERENCES_KEY = 'red-flag-rush.preferences.v1';
const HIGH_SCORE_KEY = 'red-flag-rush.high-score.v1';
const defaults: Preferences = { muted: false, haptics: true, tutorialSeen: false };
let memoryPreferences: Preferences = { ...defaults };
let memoryHighScore = 0;
let preferencesLoaded = false;

function read(key: string): string | null {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
}

function write(key: string, value: string): void {
  try { globalThis.localStorage?.setItem(key, value); } catch { /* Session fallback stays playable. */ }
}

export function loadPreferences(): Preferences {
  if (preferencesLoaded) return { ...memoryPreferences };
  preferencesLoaded = true;
  try {
    const raw = read(PREFERENCES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed !== null && typeof parsed === 'object') {
      const stored = parsed as Record<string, unknown>;
      memoryPreferences = {
        muted: typeof stored.muted === 'boolean' ? stored.muted : defaults.muted,
        haptics: typeof stored.haptics === 'boolean' ? stored.haptics : defaults.haptics,
        tutorialSeen: typeof stored.tutorialSeen === 'boolean' ? stored.tutorialSeen : defaults.tutorialSeen,
      };
    }
  } catch { /* Corrupt or unavailable storage must not prevent play. */ }
  return { ...memoryPreferences };
}

export function savePreferences(update: Partial<Preferences>): Preferences {
  memoryPreferences = { ...loadPreferences(), ...update };
  write(PREFERENCES_KEY, JSON.stringify(memoryPreferences));
  return { ...memoryPreferences };
}

export function loadHighScore(): number {
  const stored = read(HIGH_SCORE_KEY);
  memoryHighScore = betterHighScore(memoryHighScore, stored === null ? 0 : Number(stored));
  return memoryHighScore;
}

export function saveHighScore(score: number): number {
  memoryHighScore = betterHighScore(loadHighScore(), score);
  write(HIGH_SCORE_KEY, String(memoryHighScore));
  return memoryHighScore;
}
