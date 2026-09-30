// Unlock state for premium scenario packs. Non-consumable purchases via the
// stores' official billing (Play Billing / StoreKit through @capgo/native-purchases).
// Ownership comes from the store on native and is mirrored locally; the web build
// has no billing at all and simply stays on the free base topics.
import { Capacitor } from '@capacitor/core';
import { PACK_CATEGORY } from '../data/scenario-bank';
import { ALL_PRODUCT_IDS, BUNDLE_PRODUCT_ID, PACKS, packForProduct } from './products';

/** Subset of @capgo/native-purchases used here. Injectable for tests. */
export interface PurchaseGateway {
  getProducts(options: { productIdentifiers: string[] }): Promise<{ products: Array<{ identifier?: string; productIdentifier?: string; priceString?: string }> }>;
  purchaseProduct(options: { productIdentifier: string }): Promise<{ productIdentifier?: string }>;
  getPurchases(): Promise<{ purchases: Array<{ productIdentifier?: string }> }>;
  restorePurchases(): Promise<void>;
}

const STORAGE_KEY = 'red-flag-rush.packs.v1';

function readOwned(): Set<string> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return new Set(parsed.filter((id): id is string => typeof id === 'string' && PACKS.some((pack) => pack.packId === id)));
  } catch { /* A corrupt cache just means the store is asked again. */ }
  return new Set();
}

export class PurchaseManager {
  private owned = readOwned();
  private prices = new Map<string, string>();

  constructor(private readonly gateway: PurchaseGateway | null) {}

  /** Purchases only exist in native apps. */
  get storeAvailable(): boolean { return this.gateway !== null; }

  owns(packId: string): boolean { return this.owned.has(packId); }

  /** Categories the player may use right now: base topics plus owned packs. */
  unlockedCategories(base: readonly string[]): string[] {
    const premium = PACKS.filter((pack) => this.owned.has(pack.packId))
      .map((pack) => PACK_CATEGORY[pack.packId])
      .filter((category): category is string => typeof category === 'string');
    return [...base, ...premium];
  }

  priceFor(productId: string): string | undefined { return this.prices.get(productId); }

  private persist(): void {
    try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...this.owned])); } catch { /* Non-fatal. */ }
  }

  private grant(productId: string): void {
    if (productId === BUNDLE_PRODUCT_ID) for (const pack of PACKS) this.owned.add(pack.packId);
    else {
      const pack = packForProduct(productId);
      if (pack) this.owned.add(pack.packId);
    }
    this.persist();
  }

  /** Ask the store for live prices and restore already-owned packs (fresh install, new phone). */
  async sync(): Promise<void> {
    if (!this.gateway) return;
    try {
      const { products } = await this.gateway.getProducts({ productIdentifiers: [...ALL_PRODUCT_IDS] });
      for (const product of products) {
        const id = product.identifier ?? product.productIdentifier;
        if (id && product.priceString) this.prices.set(id, product.priceString);
      }
    } catch { /* Prices fall back to the configured defaults. */ }
    // Query current entitlements silently. StoreKit restore can prompt for an
    // Apple ID, so it must only run after the user presses Restore purchases.
    await this.refreshOwned();
  }

  /** Store round-trip: returns the pack ids granted (empty when cancelled/failed). */
  async buy(productId: string): Promise<string[]> {
    if (!this.gateway) return [];
    try {
      const transaction = await this.gateway.purchaseProduct({ productIdentifier: productId });
      const id = transaction.productIdentifier ?? productId;
      const before = new Set(this.owned);
      this.grant(id);
      return [...this.owned].filter((packId) => !before.has(packId));
    } catch {
      return []; // Cancelled sheet or failed payment — nothing granted, nothing lost.
    }
  }

  /** Re-check owned products with the store (also the mandatory "restore" path). */
  async restore(): Promise<string[]> {
    if (!this.gateway) return [...this.owned];
    try {
      await this.gateway.restorePurchases();
    } catch { /* Keep the locally cached entitlements. */ }
    return this.refreshOwned();
  }

  private async refreshOwned(): Promise<string[]> {
    if (!this.gateway) return [...this.owned];
    try {
      const { purchases } = await this.gateway.getPurchases();
      for (const purchase of purchases) {
        if (purchase.productIdentifier) this.grant(purchase.productIdentifier);
      }
    } catch { /* Keep the locally cached entitlements. */ }
    return [...this.owned];
  }
}

/** Store-backed manager on native; an inert base-content-only manager on the web. */
export async function createPurchaseManager(): Promise<PurchaseManager> {
  if (!Capacitor.isNativePlatform()) return new PurchaseManager(null);
  let gateway: PurchaseGateway | null = null;
  try {
    const { NativePurchases } = await import('@capgo/native-purchases');
    gateway = NativePurchases as unknown as PurchaseGateway;
  } catch { /* Plugin missing (e.g. unsynced build): base content only, no crash. */ }
  const manager = new PurchaseManager(gateway);
  // Billing can hang on devices without working store services (bare emulators,
  // signed-out Play Store) — never block the shop forever; the manager swaps in
  // with fallback prices and sync results still land whenever they arrive.
  await Promise.race([manager.sync(), new Promise<void>((resolve) => { setTimeout(resolve, 10_000); })]);
  return manager;
}
