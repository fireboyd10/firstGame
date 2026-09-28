// Premium content packs: one non-consumable in-app product per pack plus a bundle.
// These product IDs must match exactly what you create in Play Console /
// App Store Connect — see docs/DEPLOYMENT.md. Prices shown are fallbacks; the
// store's localized price is used whenever the store is reachable.
import { PACK_CATEGORY } from '../data/scenario-bank';

export interface PackDefinition {
  /** Stable id used in the scenario bank and UI. */
  readonly packId: string;
  /** Store product id (identical on Google Play and the App Store). */
  readonly productId: string;
  readonly title: string;
  readonly tagline: string;
  readonly fallbackPrice: string;
}

export const PACKS: readonly PackDefinition[] = [
  {
    packId: 'afterdark',
    productId: 'redflagrush.pack.afterdark',
    title: 'After Dark',
    tagline: 'The spicy deck. Suggestive, never explicit — still 17+.',
    fallbackPrice: '€1.99',
  },
  {
    packId: 'delulu',
    productId: 'redflagrush.pack.delulu',
    title: 'Delulu & Icks',
    tagline: 'Situationships, beige flags, and terminal online-ness.',
    fallbackPrice: '€1.99',
  },
  {
    packId: 'exfiles',
    productId: 'redflagrush.pack.exfiles',
    title: 'The Ex Files',
    tagline: 'Breakups, baggage, and beautifully petty behaviour.',
    fallbackPrice: '€1.99',
  },
];

export const BUNDLE_PRODUCT_ID = 'redflagrush.pack.bundle';
export const BUNDLE_FALLBACK_PRICE = '€2.99';
export const BUNDLE_TITLE = 'All three packs';

export const ALL_PRODUCT_IDS: readonly string[] = [...PACKS.map((pack) => pack.productId), BUNDLE_PRODUCT_ID];

/** Scenario-bank category a pack unlocks. */
export function categoryForPack(packId: string): string | undefined {
  return PACK_CATEGORY[packId];
}

export function packForProduct(productId: string): PackDefinition | undefined {
  return PACKS.find((pack) => pack.productId === productId);
}
