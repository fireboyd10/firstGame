import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('local persistence', () => {
  let values: Map<string, string>;
  beforeEach(() => {
    vi.resetModules();
    values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('persists tutorial, mute, and haptics while merging partial changes', async () => {
    const storage = await import('./storage');
    expect(storage.loadPreferences()).toEqual({ muted: false, haptics: true, tutorialSeen: false });
    storage.savePreferences({ tutorialSeen: true });
    storage.savePreferences({ muted: true, haptics: false });
    vi.resetModules();
    const reloaded = await import('./storage');
    expect(reloaded.loadPreferences()).toEqual({ muted: true, haptics: false, tutorialSeen: true });
  });

  it('persists the highest result without replacing it with a lower score', async () => {
    const storage = await import('./storage');
    expect(storage.loadHighScore()).toBe(0);
    expect(storage.saveHighScore(450)).toBe(450);
    expect(storage.saveHighScore(300)).toBe(450);
    vi.resetModules();
    const reloaded = await import('./storage');
    expect(reloaded.loadHighScore()).toBe(450);
  });

  it('ignores corrupt and wrong-typed saved values', async () => {
    values.set('red-flag-rush.preferences.v1', '{broken');
    values.set('red-flag-rush.high-score.v1', 'not a number');
    const storage = await import('./storage');
    expect(storage.loadPreferences().muted).toBe(false);
    expect(storage.loadHighScore()).toBe(0);
    values.set('red-flag-rush.preferences.v1', '{"muted":"yes","haptics":false}');
    vi.resetModules();
    const reloaded = await import('./storage');
    expect(reloaded.loadPreferences()).toEqual({ muted: false, haptics: false, tutorialSeen: false });
  });

  it('remains playable with session persistence when browser storage is blocked', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('Storage is blocked'); },
      setItem: () => { throw new Error('Quota exceeded'); },
    });
    const storage = await import('./storage');
    storage.savePreferences({ muted: true });
    expect(storage.loadPreferences().muted).toBe(true);
    expect(storage.saveHighScore(750)).toBe(750);
    expect(storage.loadHighScore()).toBe(750);
  });

  it('retains new session preferences if reading succeeds but writing fails', async () => {
    values.set('red-flag-rush.preferences.v1', '{"muted":false,"haptics":true,"tutorialSeen":false}');
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: () => { throw new Error('Storage quota exhausted'); },
    });
    const storage = await import('./storage');
    storage.savePreferences({ muted: true });
    expect(storage.loadPreferences().muted).toBe(true);
  });
});
