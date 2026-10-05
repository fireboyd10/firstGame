// Reusable ad system. One interstitial after every 1–2 finished games (solo runs
// and party matches count alike), shown only when the game finishes, before the
// player can replay or navigate. Late ads are skipped. The schedule is
// persisted, so relaunching the app does not reset the completed-game counter.
// Everything is a no-op on the web — ads only exist in the native apps.
import { Capacitor } from '@capacitor/core';
import { AD_POLICY, adUnitsFor, usingTestAds, type AdPolicy, type AdUnitIds } from './config';
import { createInterstitialPresenter } from './interstitial-presenter';

/** Subset of @capacitor-community/admob used by the game. Injectable for tests. */
export interface AdGateway {
  initialize(options?: { initializeForTesting?: boolean }): Promise<void>;
  requestConsentInfo(): Promise<AdConsentInfo>;
  showConsentForm(): Promise<AdConsentInfo>;
  showPrivacyOptionsForm(): Promise<void>;
  prepareInterstitial(options: { adId: string; npa: boolean }): Promise<unknown>;
  showInterstitial(): Promise<void>;
}

interface AdConsentInfo {
  status: string;
  canRequestAds: boolean;
  isConsentFormAvailable?: boolean;
  privacyOptionsRequirementStatus: string;
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
  private loading: Promise<void> | null = null;
  private loadGeneration = 0;
  private showing = false;
  private consentAllowsAds = false;
  private testing = false;
  privacyOptionsRequired = false;

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

  get canShowInterstitial(): boolean {
    return this.initialized && this.consentAllowsAds && this.interstitialReady && !this.showing
      && shouldShowInterstitial(this.completedGames, this.nextInterstitialAtGame);
  }

  private preloadInterstitial(): void {
    if (!this.gateway || !this.initialized || !this.consentAllowsAds
      || this.loading || this.interstitialReady || this.showing) return;
    const generation = this.loadGeneration;
    const loading = this.gateway.prepareInterstitial({ adId: this.units.interstitial, npa: true })
      .then(() => {
        if (generation === this.loadGeneration && this.consentAllowsAds) this.interstitialReady = true;
      })
      .catch(() => { /* No fill or offline: skip the ad and keep the game playable. */ })
      .finally(() => { if (this.loading === loading) this.loading = null; });
    this.loading = loading;
  }

  async initialize(initializeForTesting: boolean): Promise<boolean> {
    if (!this.gateway) return false;
    if (this.initialized) return this.consentAllowsAds;
    this.testing = initializeForTesting;
    try {
      // This plugin binds the consent form's view controller in initialize().
      // Initializing the SDK does not authorize our app to request an ad.
      await this.gateway.initialize({ initializeForTesting });
      // Test units are for device previews. Live ads must wait for UMP, even
      // when non-personalized ads are requested and ATT is never requested.
      if (!this.testing) {
        let consent = await this.gateway.requestConsentInfo();
        this.privacyOptionsRequired = consent.privacyOptionsRequirementStatus === 'REQUIRED';
        if (consent.status === 'REQUIRED' && consent.isConsentFormAvailable) {
          consent = await this.gateway.showConsentForm();
        }
        this.privacyOptionsRequired = consent.privacyOptionsRequirementStatus === 'REQUIRED';
        if (!consent.canRequestAds) return false;
      }
      this.consentAllowsAds = true;
      this.initialized = true;
      this.preloadInterstitial();
      return true;
    } catch {
      this.consentAllowsAds = false;
      return false; // No ad SDK (old WebView, no Play services) — play stays uninterrupted.
    }
  }

  async showPrivacyOptions(): Promise<boolean> {
    if (!this.gateway || !this.privacyOptionsRequired) return false;
    this.consentAllowsAds = false;
    this.interstitialReady = false;
    this.loadGeneration++;
    this.loading = null;
    this.initialized = false;
    try {
      await this.gateway.showPrivacyOptionsForm();
      await this.initialize(this.testing);
      return true;
    } catch {
      return false;
    }
  }

  /** Count completed games; never wait for a late load at this breakpoint. */
  recordGameCompleted(): void {
    this.completedGames++;
    this.persist();
    this.preloadInterstitial();
  }

  /**
   * Called once at game completion. Only an already loaded ad can show; a late
   * load is saved for a future game. Resolves after dismissal or display failure.
   */
  async maybeShowInterstitial(): Promise<boolean> {
    if (!this.gateway || !this.canShowInterstitial) return false;
    this.showing = true;
    this.interstitialReady = false;
    try {
      await this.gateway.showInterstitial();
      this.nextInterstitialAtGame = nextInterstitialThreshold(this.completedGames, this.policy, this.random);
      this.interstitialReady = false;
      this.persist();
      return true;
    } catch {
      this.interstitialReady = false;
      return false; // A failed ad must never block playing on.
    } finally {
      this.showing = false;
      this.preloadInterstitial();
    }
  }
}

/** Real AdMob-backed manager on native; an inert no-gateway manager on the web. */
export async function createAdManager(policy: AdPolicy = AD_POLICY): Promise<AdManager> {
  if (!Capacitor.isNativePlatform()) return new AdManager(null, adUnitsFor('android'), policy);
  const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
  let gateway: AdGateway | null = null;
  try {
    const { AdMob, InterstitialAdPluginEvents } = await import('@capacitor-community/admob');
    const showInterstitial = await createInterstitialPresenter({
      onDismiss: (listener) => AdMob.addListener(InterstitialAdPluginEvents.Dismissed, listener),
      onFailure: (listener) => AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, listener),
      show: () => AdMob.showInterstitial(),
    });
    gateway = {
      initialize: (options) => AdMob.initialize(options),
      requestConsentInfo: () => AdMob.requestConsentInfo(),
      showConsentForm: () => AdMob.showConsentForm(),
      showPrivacyOptionsForm: () => AdMob.showPrivacyOptionsForm(),
      prepareInterstitial: (options) => AdMob.prepareInterstitial(options),
      showInterstitial,
    };
  } catch { /* Plugin missing (e.g. unsynced build): stay ad-free rather than crash. */ }
  const manager = new AdManager(gateway, adUnitsFor(platform), policy);
  await manager.initialize(usingTestAds(platform));
  return manager;
}
