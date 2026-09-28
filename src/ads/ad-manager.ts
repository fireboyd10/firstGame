// Reusable ad system. One interstitial after every 1–2 finished games (solo runs
// and party matches count alike), shown only at natural breakpoints: leaving the
// results screen or closing a finished party. Never mid-game. The schedule is
// persisted, so relaunching the app can never reset or skip it.
// Everything is a no-op on the web — ads only exist in the native apps.
import { Capacitor } from '@capacitor/core';
import { AD_POLICY, adUnitsFor, usingTestAds, type AdPolicy, type AdUnitIds } from './config';

/** Subset of @capacitor-community/admob used by the game. Injectable for tests. */
export interface AdGateway {
  initialize(options?: { initializeForTesting?: boolean }): Promise<void>;
  prepareInterstitial(options: { adId: string }): Promise<unknown>;
  showInterstitial(): Promise<void>;
}

interface PersistedAdState {
  readonly completedGames: number;
  readonly nextAt: number;
}

const STORAGE_KEY = 'red-flag-rush.ads.v2';

function readPersisted(): Partial<PersistedAdState> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed !== null && typeof parsed === 'object') {
      const stored = parsed as Record<string, unknown>;
      const num = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
      return { completedGames: num(stored.completedGames), nextAt: num(stored.nextAt) };
    }
  } catch { /* Unavailable storage just restarts the schedule. */ }
  return {};
}

function writePersisted(state: PersistedAdState): void {
  try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Non-fatal. */ }
}

/** Pure placement rule, unit-tested: the ad is due once the threshold game is finished. */
export function shouldShowInterstitial(completedGames: number, nextInterstitialAtGame: number): boolean {
  return completedGames >= nextInterstitialAtGame;
}

/** Next game count at which an interstitial is due: current + a varied 1–2 game gap. */
export function nextInterstitialThreshold(
  fromGame: number,
  policy: AdPolicy = AD_POLICY,
  random: () => number = Math.random,
): number {
  const span = policy.interstitialRunGapMax - policy.interstitialRunGapMin + 1;
  return fromGame + policy.interstitialRunGapMin + Math.floor(random() * span);
}

export class AdManager {
  private initialized = false;
  private completedGames: number;
  private nextInterstitialAtGame: number;
  private interstitialReady = false;

  constructor(
    private readonly gateway: AdGateway | null,
    private readonly units: AdUnitIds,
    private readonly policy: AdPolicy = AD_POLICY,
    private readonly random: () => number = Math.random,
  ) {
    const persisted = readPersisted();
    this.completedGames = persisted.completedGames ?? 0;
    this.nextInterstitialAtGame = persisted.nextAt && persisted.nextAt >= this.policy.interstitialRunGapMin
      ? persisted.nextAt
      : nextInterstitialThreshold(this.completedGames, this.policy, this.random);
  }

  private persist(): void {
    writePersisted({ completedGames: this.completedGames, nextAt: this.nextInterstitialAtGame });
  }

  /** Ads only exist in native apps; the web/PWA experience stays ad-free. */
  get adsAvailable(): boolean { return this.gateway !== null; }

  async initialize(initializeForTesting: boolean): Promise<boolean> {
    if (!this.gateway || this.initialized) return this.gateway !== null;
    try {
      await this.gateway.initialize({ initializeForTesting });
      this.initialized = true;
      return true;
    } catch {
      return false; // No ad SDK (old WebView, no Play services) — play stays uninterrupted.
    }
  }

  /** Called when any game finishes (solo run or party match). Preloads the ad when one comes due. */
  recordGameCompleted(): void {
    this.completedGames++;
    this.persist();
    if (this.gateway && this.initialized
      && shouldShowInterstitial(this.completedGames, this.nextInterstitialAtGame)) {
      this.interstitialReady = false;
      this.gateway.prepareInterstitial({ adId: this.units.interstitial })
        .then(() => { this.interstitialReady = true; })
        .catch(() => { this.interstitialReady = false; });
    }
  }

  /**
   * Shows the due interstitial at a natural breakpoint (leaving results / closing a
   * finished party). Never blocks the transition; resolves false when no ad was shown.
   */
  async maybeShowInterstitial(): Promise<boolean> {
    if (!this.gateway || !this.initialized) return false;
    if (!shouldShowInterstitial(this.completedGames, this.nextInterstitialAtGame)) return false;
    try {
      if (!this.interstitialReady) await this.gateway.prepareInterstitial({ adId: this.units.interstitial });
      await this.gateway.showInterstitial();
      this.nextInterstitialAtGame = nextInterstitialThreshold(this.completedGames, this.policy, this.random);
      this.interstitialReady = false;
      this.persist();
      return true;
    } catch {
      this.interstitialReady = false;
      return false; // A failed ad must never block playing on.
    }
  }
}

/** Real AdMob-backed manager on native; an inert no-gateway manager on the web. */
export async function createAdManager(policy: AdPolicy = AD_POLICY): Promise<AdManager> {
  if (!Capacitor.isNativePlatform()) return new AdManager(null, adUnitsFor('android'), policy);
  const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
  let gateway: AdGateway | null = null;
  try {
    const { AdMob } = await import('@capacitor-community/admob');
    gateway = AdMob;
  } catch { /* Plugin missing (e.g. unsynced build): stay ad-free rather than crash. */ }
  const manager = new AdManager(gateway, adUnitsFor(platform), policy);
  await manager.initialize(usingTestAds(platform));
  return manager;
}
