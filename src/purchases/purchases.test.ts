import { beforeEach, describe, expect, it } from 'vitest';
import { PurchaseManager, type PurchaseGateway } from './purchases';
import { BUNDLE_PRODUCT_ID, PACKS } from './products';
import { BASE_CATEGORIES, PACK_CATEGORY } from '../data/scenario-bank';

// Node has no localStorage — polyfill so entitlement caching is testable.
const memoryStore = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => { memoryStore.set(key, value); },
};
beforeEach(() => memoryStore.clear());

function fakeGateway(overrides: Partial<PurchaseGateway> = {}): PurchaseGateway {
  return {
    getProducts: async () => ({ products: [{ identifier: PACKS[0]!.productId, priceString: '€1.99' }] }),
    purchaseProduct: async ({ productIdentifier }) => ({ productIdentifier }),
    getPurchases: async () => ({ purchases: [] }),
    restorePurchases: async () => {},
    ...overrides,
  };
}

describe('PurchaseManager', () => {
  it('is base-content-only without a store (web/PWA)', async () => {
    const manager = new PurchaseManager(null);
    expect(manager.storeAvailable).toBe(false);
    expect(await manager.buy(PACKS[0]!.productId)).toEqual([]);
    expect(manager.unlockedCategories(BASE_CATEGORIES)).toEqual([...BASE_CATEGORIES]);
  });

  it('grants the pack for a completed purchase and unlocks its category', async () => {
    const manager = new PurchaseManager(fakeGateway());
    const granted = await manager.buy(PACKS[0]!.productId);
    expect(granted).toEqual([PACKS[0]!.packId]);
    expect(manager.owns(PACKS[0]!.packId)).toBe(true);
    expect(manager.unlockedCategories(BASE_CATEGORIES)).toContain(PACK_CATEGORY[PACKS[0]!.packId]!);
  });

  it('grants nothing when the purchase sheet is cancelled — and charges nothing', async () => {
    const manager = new PurchaseManager(fakeGateway({
      purchaseProduct: async () => { throw new Error('cancelled'); },
    }));
    expect(await manager.buy(PACKS[1]!.productId)).toEqual([]);
    expect(manager.owns(PACKS[1]!.packId)).toBe(false);
  });

  it('the bundle unlocks every pack at once', async () => {
    const manager = new PurchaseManager(fakeGateway());
    const granted = await manager.buy(BUNDLE_PRODUCT_ID);
    expect(granted.sort()).toEqual(PACKS.map((pack) => pack.packId).sort());
    expect(manager.unlockedCategories(BASE_CATEGORIES)).toHaveLength(BASE_CATEGORIES.length + PACKS.length);
  });

  it('restores purchases from the store (fresh install / new phone)', async () => {
    const manager = new PurchaseManager(fakeGateway({
      getPurchases: async () => ({ purchases: [{ productIdentifier: PACKS[2]!.productId }] }),
    }));
    expect(await manager.restore()).toEqual([PACKS[2]!.packId]);
    expect(manager.owns(PACKS[2]!.packId)).toBe(true);
  });

  it('keeps entitlements across app restarts via the local cache', async () => {
    const first = new PurchaseManager(fakeGateway());
    await first.buy(PACKS[0]!.productId);
    const second = new PurchaseManager(fakeGateway());
    expect(second.owns(PACKS[0]!.packId)).toBe(true);
  });

  it('uses store prices when reachable and falls back gracefully', async () => {
    const manager = new PurchaseManager(fakeGateway());
    await manager.sync();
    expect(manager.priceFor(PACKS[0]!.productId)).toBe('€1.99');
    const offline = new PurchaseManager(fakeGateway({
      getProducts: async () => { throw new Error('offline'); },
    }));
    await offline.sync();
    expect(offline.priceFor(PACKS[0]!.productId)).toBeUndefined();
  });
});

describe('pack catalogue', () => {
  it('every pack maps to a real scenario-bank category', () => {
    for (const pack of PACKS) expect(PACK_CATEGORY[pack.packId]).toBeTruthy();
    expect(PACKS).toHaveLength(3);
  });
});
