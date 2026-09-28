// AdMob configuration. Defaults are Google's official test ad units so live ads
// are never served during development. Set the VITE_ADMOB_* variables at build
// time (e.g. in a .env file or CI secrets) to switch to your production units.
//
// Production app IDs must ALSO be set in the native projects:
//   android/app/src/main/AndroidManifest.xml  -> com.google.android.gms.ads.APPLICATION_ID
//   ios/App/App/Info.plist                    -> GADApplicationIdentifier
// See docs/DEPLOYMENT.md.

export interface AdUnitIds {
  readonly interstitial: string;
}

export interface AdPolicy {
  /** An interstitial appears after every 1–2 completed games (varied per schedule). */
  readonly interstitialRunGapMin: number;
  readonly interstitialRunGapMax: number;
}

// Google's official test ad units — always safe, never monetized, never policy risk.
// https://developers.google.com/admob/android/test-ads / .../ios/test-ads
const TEST_UNITS: Record<'android' | 'ios', AdUnitIds> = {
  android: { interstitial: 'ca-app-pub-3940256099942544/1033173712' },
  ios: { interstitial: 'ca-app-pub-3940256099942544/4411468910' },
};

export const TEST_APP_IDS: Record<'android' | 'ios', string> = {
  android: 'ca-app-pub-3940256099942544~3347511713',
  ios: 'ca-app-pub-3940256099942544~1458002511',
};

export const AD_POLICY: AdPolicy = {
  interstitialRunGapMin: 1,
  interstitialRunGapMax: 2,
};

function env(name: string): string | undefined {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

export function adUnitsFor(platform: 'android' | 'ios'): AdUnitIds {
  const prefix = platform === 'android' ? 'VITE_ADMOB_ANDROID' : 'VITE_ADMOB_IOS';
  return {
    interstitial: env(`${prefix}_INTERSTITIAL_ID`) ?? TEST_UNITS[platform].interstitial,
  };
}

/** True while the ad unit is a Google test unit — keeps AdMob in testing mode. */
export function usingTestAds(platform: 'android' | 'ios'): boolean {
  return adUnitsFor(platform).interstitial.includes('3940256099942544');
}
