import { beforeEach, describe, expect, it } from 'vitest';
import { AdManager, nextInterstitialThreshold, shouldShowInterstitial, type AdGateway } from './ad-manager';
import { AD_POLICY, adUnitsFor, usingTestAds } from './config';

// Node has no localStorage — polyfill it so schedule persistence is testable.
const memoryStore = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => { memoryStore.set(key, value); },
};
beforeEach(() => memoryStore.clear());

const units = adUnitsFor('android');

function fakeGateway(overrides: Partial<AdGateway> = {}): AdGateway & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    initialize: async () => { calls.push('initialize'); },
    requestConsentInfo: async () => ({ status: 'NOT_REQUIRED', canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' }),
    showConsentForm: async () => ({ status: 'OBTAINED', canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' }),
    showPrivacyOptionsForm: async () => { calls.push('privacyOptions'); },
    prepareInterstitial: async () => { calls.push('prepareInterstitial'); },
    showInterstitial: async () => { calls.push('showInterstitial'); },
    ...overrides,
  };
}

describe('interstitial placement policy', () => {
  it('varies the gap between ads between 1 and 2 completed games', () => {
    expect(nextInterstitialThreshold(0, AD_POLICY, () => 0)).toBe(1);
    expect(nextInterstitialThreshold(0, AD_POLICY, () => 0.999)).toBe(2);
    expect(nextInterstitialThreshold(5, AD_POLICY, () => 0)).toBe(6);
    expect(nextInterstitialThreshold(5, AD_POLICY, () => 0.999)).toBe(7);
  });
  it('is due exactly on or after the threshold game — no timers involved', () => {
    expect(shouldShowInterstitial(0, 1)).toBe(false);
    expect(shouldShowInterstitial(1, 1)).toBe(true);
    expect(shouldShowInterstitial(5, 2)).toBe(true);
  });
});

describe('AdManager', () => {
  it('does not load live ads when consent is unavailable', async () => {
    for (const requestConsentInfo of [
      async () => ({ status: 'REQUIRED', canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' }),
      async () => { throw new Error('offline'); },
    ]) {
      const gateway = fakeGateway({ requestConsentInfo });
      const manager = new AdManager(gateway, units, AD_POLICY, () => 0);
      expect(await manager.initialize(false)).toBe(false);
      manager.recordGameCompleted();
      expect(await manager.maybeShowInterstitial()).toBe(false);
      expect(gateway.calls).toEqual(['initialize']);
    }
  });

  it('gathers required consent before requesting non-personalized live ads', async () => {
    const gateway = fakeGateway({
      requestConsentInfo: async () => ({ status: 'REQUIRED', canRequestAds: false, isConsentFormAvailable: true, privacyOptionsRequirementStatus: 'REQUIRED' }),
      prepareInterstitial: async (options) => { expect(options.npa).toBe(true); },
    });
    const manager = new AdManager(gateway, units, AD_POLICY, () => 0);
    expect(await manager.initialize(false)).toBe(true);
    expect(manager.privacyOptionsRequired).toBe(true);
    manager.recordGameCompleted();
    expect(await manager.maybeShowInterstitial()).toBe(true);
  });

  it('discards a prepared ad when privacy choices no longer permit requests', async () => {
    let allowed = true;
    const gateway = fakeGateway({
      requestConsentInfo: async () => ({ status: 'OBTAINED', canRequestAds: allowed, privacyOptionsRequirementStatus: 'REQUIRED' }),
      showPrivacyOptionsForm: async () => { allowed = false; },
    });
    const manager = new AdManager(gateway, units, AD_POLICY, () => 0);
    await manager.initialize(false);
    manager.recordGameCompleted();
    await Promise.resolve();
    expect(await manager.showPrivacyOptions()).toBe(true);
    expect(await manager.maybeShowInterstitial()).toBe(false);
    expect(gateway.calls).not.toContain('showInterstitial');
  });

  it('is inert without a gateway (web/PWA stays ad-free)', async () => {
    const manager = new AdManager(null, units);
    expect(manager.adsAvailable).toBe(false);
    await manager.initialize(true);
    manager.recordGameCompleted();
    manager.recordGameCompleted();
    manager.recordGameCompleted();
    expect(await manager.maybeShowInterstitial()).toBe(false);
  });

  it('shows after every game back to back when the gap rolls low', async () => {
    const gateway = fakeGateway();
    const manager = new AdManager(gateway, units, AD_POLICY, () => 0); // gap always 1
    await manager.initialize(true);
    for (let game = 1; game <= 4; game++) {
      // Games take time to play; the next cached ad loads between completion breaks.
      await new Promise(resolve => setTimeout(resolve, 0));
      manager.recordGameCompleted();
      expect(await manager.maybeShowInterstitial()).toBe(true);
    }
    expect(gateway.calls.filter((call) => call === 'showInterstitial')).toHaveLength(4);
  });

  it('with a gap of 2, every second game earns the ad', async () => {
    const gateway = fakeGateway();
    const manager = new AdManager(gateway, units, AD_POLICY, () => 0.999); // gap always 2
    await manager.initialize(true);
    manager.recordGameCompleted();
    expect(await manager.maybeShowInterstitial()).toBe(false); // game 1
    manager.recordGameCompleted();
    expect(await manager.maybeShowInterstitial()).toBe(true); // game 2: due
    manager.recordGameCompleted();
    expect(await manager.maybeShowInterstitial()).toBe(false); // game 3
    manager.recordGameCompleted();
    expect(await manager.maybeShowInterstitial()).toBe(true); // game 4: due again
  });

  it('keeps the schedule across app restarts instead of resetting it', async () => {
    const gateway = fakeGateway();
    const first = new AdManager(gateway, units, AD_POLICY, () => 0);
    await first.initialize(true);
    first.recordGameCompleted(); // game 1 of 2 — then the app is "restarted"
    const second = new AdManager(gateway, units, AD_POLICY, () => 0);
    await second.initialize(true);
    second.recordGameCompleted(); // game 2 — still due, not reset to zero
    expect(await second.maybeShowInterstitial()).toBe(true);
  });

  it('preloads during play before a game finishes', async () => {
    const gateway = fakeGateway();
    const manager = new AdManager(gateway, units, AD_POLICY, () => 0); // gap 1: due from game 1
    await manager.initialize(true);
    expect(gateway.calls).toContain('prepareInterstitial');
    expect(manager.canShowInterstitial).toBe(false);
  });

  it('skips a slow load at completion without duplicating it or showing later', async () => {
    let loaded!: () => void;
    const gateway = fakeGateway({ prepareInterstitial: () => {
      gateway.calls.push('prepareInterstitial');
      return new Promise<void>(resolve => { loaded = resolve; });
    } });
    const manager = new AdManager(gateway, units, AD_POLICY, () => 0);
    await manager.initialize(true);
    manager.recordGameCompleted();
    expect(await manager.maybeShowInterstitial()).toBe(false);
    expect(gateway.calls.filter(call => call === 'prepareInterstitial')).toHaveLength(1);
    loaded();
    await Promise.resolve();
    expect(gateway.calls).not.toContain('showInterstitial');
    // A ready ad is eligible only when the caller reaches a future completion break.
    manager.recordGameCompleted();
    expect(await manager.maybeShowInterstitial()).toBe(true);
  });

  it('presents only once while dismissal is pending', async () => {
    let dismissed!: () => void;
    const gateway = fakeGateway({ showInterstitial: () => {
      gateway.calls.push('showInterstitial');
      return new Promise<void>(resolve => { dismissed = resolve; });
    } });
    const manager = new AdManager(gateway, units, AD_POLICY, () => 0);
    await manager.initialize(true);
    manager.recordGameCompleted();
    const showing = manager.maybeShowInterstitial();
    expect(manager.canShowInterstitial).toBe(false);
    expect(await manager.maybeShowInterstitial()).toBe(false);
    expect(gateway.calls.filter(call => call === 'showInterstitial')).toHaveLength(1);
    dismissed();
    expect(await showing).toBe(true);
  });

  it('ignores a pending load after consent is revoked', async () => {
    let loaded!: () => void;
    let allowed = true;
    const gateway = fakeGateway({
      requestConsentInfo: async () => ({ status: 'OBTAINED', canRequestAds: allowed, privacyOptionsRequirementStatus: 'REQUIRED' }),
      showPrivacyOptionsForm: async () => { allowed = false; },
      prepareInterstitial: () => new Promise<void>(resolve => { loaded = resolve; }),
    });
    const manager = new AdManager(gateway, units, AD_POLICY, () => 0);
    await manager.initialize(false);
    manager.recordGameCompleted();
    await manager.showPrivacyOptions();
    loaded();
    await Promise.resolve();
    expect(manager.canShowInterstitial).toBe(false);
    expect(await manager.maybeShowInterstitial()).toBe(false);
  });

  it('never blocks the transition when the ad fails', async () => {
    const gateway = fakeGateway({
      prepareInterstitial: async () => { throw new Error('no fill'); },
    });
    const manager = new AdManager(gateway, units, AD_POLICY, () => 0);
    await manager.initialize(true);
    manager.recordGameCompleted();
    manager.recordGameCompleted();
    expect(await manager.maybeShowInterstitial()).toBe(false);
  });
});

describe('ad configuration', () => {
  it('defaults to Google test units on both platforms and reports testing mode', () => {
    for (const platform of ['android', 'ios'] as const) {
      expect(adUnitsFor(platform).interstitial).toContain('3940256099942544');
      expect(usingTestAds(platform)).toBe(true);
    }
  });
});
