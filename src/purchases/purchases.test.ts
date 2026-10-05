import { beforeEach, describe, expect, it } from 'vitest';
import { PurchaseManager, type PurchaseGateway } from './purchases';
import { BUNDLE_PRODUCT_ID, PACKS } from './products';
import { BASE_CATEGORIES, PACK_CATEGORY } from '../data/scenario-bank';
import { ReviewAccess } from './review-access';

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
  it('refreshes owned packs silently on startup and restores only on explicit request', async () => {
    let restores = 0;
    const manager = new PurchaseManager(fakeGateway({
      restorePurchases: async () => { restores++; },
      getPurchases: async () => ({ purchases: [{ productIdentifier: PACKS[0]!.productId }] }),
    }));
    await manager.sync();
    expect(restores).toBe(0);
    expect(manager.owns(PACKS[0]!.packId)).toBe(true);
    await manager.restore();
    expect(restores).toBe(1);
  });

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

describe('review access stays separate from paid ownership', () => {
  it('unlocks every topic offline without calling billing or persisting a purchase', async () => {
    let payments = 0;
    const code = 'A'.repeat(24);
    const review = new ReviewAccess(true, async candidate => candidate === code);
    const manager = new PurchaseManager(fakeGateway({ purchaseProduct: async () => { payments++; throw new Error('must never charge a reviewer'); } }), review);
    expect(await review.activate('invalid')).toBe(false);
    expect(manager.unlockedCategories(BASE_CATEGORIES)).toEqual([...BASE_CATEGORIES]);
    expect(await review.activate('B'.repeat(24))).toBe(false);
    expect(await review.activate(code)).toBe(true);
    expect(manager.unlockedCategories(BASE_CATEGORIES)).toHaveLength(BASE_CATEGORIES.length + PACKS.length);
    expect(await manager.buy(BUNDLE_PRODUCT_ID)).toEqual([]);
    expect(payments).toBe(0); expect(memoryStore.size).toBe(0);
    // An async billing bootstrap may replace the manager; the session's review access survives.
    expect(new PurchaseManager(null, review).owns(PACKS[0].packId)).toBe(true);
    review.exit();
    expect(manager.unlockedCategories(BASE_CATEGORIES)).toEqual([...BASE_CATEGORIES]);
    expect(memoryStore.size).toBe(0);
  });
  it('does not enable review access on the web and keeps real purchases after review exits', async () => {
    const web = new ReviewAccess(false, async () => true);
    expect(await web.activate('A'.repeat(24))).toBe(false);
    const review = new ReviewAccess(true, async () => true);
    const manager = new PurchaseManager(fakeGateway(), review);
    await manager.buy(PACKS[1].productId);
    const ownedBefore = memoryStore.get('red-flag-rush.packs.v1');
    await review.activate('A'.repeat(24)); review.exit();
    expect(manager.owns(PACKS[1].packId)).toBe(true);
    expect(manager.owns(PACKS[0].packId)).toBe(false);
    expect(memoryStore.get('red-flag-rush.packs.v1')).toBe(ownedBefore);
  });
  it('leaves access locked if code verification is unavailable', async () => {
    const review = new ReviewAccess(true, async () => { throw new Error('plugin unavailable'); });
    expect(await review.activate('A'.repeat(24))).toBe(false);
    expect(review.active).toBe(false);
  });
});
