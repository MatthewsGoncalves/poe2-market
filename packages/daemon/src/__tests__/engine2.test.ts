import { describe, it, expect, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CacheStore } from '../cache/cacheStore.js';
import type { Config } from '../config.js';
import type { MarketItem } from '../types.js';
import { scanSnipes } from '../engines/engine2.js';

const BASE_CONFIG: Config = {
  league: 'TestLeague',
  game: 'poe2',
  syncIntervalMs: 600000,
  snipeDiscountThreshold: 0.70,
  snipeMinValueChaos: 20,
  currencyErrorMinDivines: 1.5,
  currencyErrorTolerancePct: 0.20,
  daemonPort: 3001,
  poewatchBaseUrl: 'https://api.poe.watch',
};

// min=500, mean=800 → discount = 37.5% → min/mean = 0.625 < 0.70 threshold → included
const ITEM_DEEP_DISCOUNT: MarketItem = {
  name: 'Deep Discount Item',
  mean: 800,
  min: 500,
  lowConfidence: false,
};

// min=750, mean=800 → discount = 6.25% → min/mean = 0.9375 > 0.70 threshold → excluded
const ITEM_SHALLOW_DISCOUNT: MarketItem = {
  name: 'Shallow Discount Item',
  mean: 800,
  min: 750,
  lowConfidence: false,
};

// lowConfidence: true → excluded even if discount exceeds threshold
const ITEM_LOW_CONFIDENCE: MarketItem = {
  name: 'Low Confidence Item',
  mean: 800,
  min: 400,
  lowConfidence: true,
};

// mean=15 < snipeMinValueChaos=20 → excluded
const ITEM_LOW_VALUE: MarketItem = {
  name: 'Low Value Item',
  mean: 15,
  min: 5,
  lowConfidence: false,
};

// min=0 → excluded regardless of other values
const ITEM_ZERO_MIN: MarketItem = {
  name: 'Zero Min Item',
  mean: 800,
  min: 0,
  lowConfidence: false,
};

// profit=300: mean=400, min=100
const ITEM_HIGH_PROFIT: MarketItem = {
  name: 'High Profit Item',
  mean: 400,
  min: 100,
  lowConfidence: false,
};

// profit=100: mean=200, min=100
const ITEM_LOW_PROFIT: MarketItem = {
  name: 'Low Profit Item',
  mean: 200,
  min: 100,
  lowConfidence: false,
};

// mean=160, min=100 → 37.5% discount — would qualify but currency items are excluded
const ITEM_CURRENCY_DEEP_DISCOUNT: MarketItem = {
  name: 'Divine Orb',
  mean: 160,
  min: 100,
  lowConfidence: false,
};

let store: CacheStore;

function makeStore(items: MarketItem[]): CacheStore {
  const s = new CacheStore('TestLeague', join(tmpdir(), 'engine2-test'));
  s.update(items, { divineInChaos: 160, exaltedInChaos: 10 }, 'TestLeague');
  return s;
}

beforeEach(() => {
  store = makeStore([]);
});

describe('scanSnipes() — inclusion', () => {
  it('includes an item with min=500, mean=800 (37.5% discount) when threshold=0.70', () => {
    store = makeStore([ITEM_DEEP_DISCOUNT]);
    const results = scanSnipes(store, BASE_CONFIG);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Deep Discount Item');
  });
});

describe('scanSnipes() — exclusions', () => {
  it('excludes an item with min=750, mean=800 (6.25% discount) when threshold=0.70', () => {
    store = makeStore([ITEM_SHALLOW_DISCOUNT]);
    const results = scanSnipes(store, BASE_CONFIG);
    expect(results).toHaveLength(0);
  });

  it('excludes an item with lowConfidence: true even if discount exceeds threshold', () => {
    store = makeStore([ITEM_LOW_CONFIDENCE]);
    const results = scanSnipes(store, BASE_CONFIG);
    expect(results).toHaveLength(0);
  });

  it('excludes an item with mean=15 when snipeMinValueChaos=20', () => {
    store = makeStore([ITEM_LOW_VALUE]);
    const results = scanSnipes(store, BASE_CONFIG);
    expect(results).toHaveLength(0);
  });

  it('excludes an item with min=0 regardless of other values', () => {
    store = makeStore([ITEM_ZERO_MIN]);
    const results = scanSnipes(store, BASE_CONFIG);
    expect(results).toHaveLength(0);
  });

  it('excludes currency items even when discount exceeds threshold', () => {
    store = makeStore([ITEM_CURRENCY_DEEP_DISCOUNT]);
    const results = scanSnipes(store, BASE_CONFIG);
    expect(results).toHaveLength(0);
  });
});

describe('scanSnipes() — sorting', () => {
  it('returns results sorted by profitChaos descending (profit 300 before profit 100)', () => {
    store = makeStore([ITEM_LOW_PROFIT, ITEM_HIGH_PROFIT]);
    const results = scanSnipes(store, BASE_CONFIG);
    expect(results).toHaveLength(2);
    expect(results[0].profitChaos).toBeGreaterThan(results[1].profitChaos);
    expect(results[0].name).toBe('High Profit Item');
    expect(results[1].name).toBe('Low Profit Item');
  });
});

describe('scanSnipes() — computed fields', () => {
  it('computes profitChaos as mean - min rounded to 1 decimal', () => {
    // mean=800, min=500 → profit = 300.0
    store = makeStore([ITEM_DEEP_DISCOUNT]);
    const results = scanSnipes(store, BASE_CONFIG);
    expect(results[0].profitChaos).toBe(300);
  });

  it('rounds profitChaos to 1 decimal place for non-integer results', () => {
    // mean=100.3, min=50.1 → profit = 50.2
    const item: MarketItem = { name: 'Decimal Item', mean: 100.3, min: 50.1, lowConfidence: false };
    store = makeStore([item]);
    const results = scanSnipes(store, BASE_CONFIG);
    expect(results[0].profitChaos).toBe(50.2);
  });

  it('computes discountPct correctly: min=500, mean=800 → discountPct=38', () => {
    store = makeStore([ITEM_DEEP_DISCOUNT]);
    const results = scanSnipes(store, BASE_CONFIG);
    // (1 - 500/800) * 100 = 37.5 → Math.round = 38
    expect(results[0].discountPct).toBe(38);
  });

  it('maps linkCount=0 when the item has no linkCount property', () => {
    store = makeStore([ITEM_DEEP_DISCOUNT]);
    const results = scanSnipes(store, BASE_CONFIG);
    expect(results[0].linkCount).toBe(0);
  });

  it('propagates linkCount when present', () => {
    const item: MarketItem = { name: 'Linked Item', mean: 800, min: 400, linkCount: 6, lowConfidence: false };
    store = makeStore([item]);
    const results = scanSnipes(store, BASE_CONFIG);
    expect(results[0].linkCount).toBe(6);
  });
});

describe('scanSnipes() — edge cases', () => {
  it('returns an empty array for an empty cache without error', () => {
    store = makeStore([]);
    const results = scanSnipes(store, BASE_CONFIG);
    expect(results).toEqual([]);
  });

  it('handles a mix of qualifying and non-qualifying items, returning only qualifying ones', () => {
    store = makeStore([
      ITEM_DEEP_DISCOUNT,    // qualifies
      ITEM_SHALLOW_DISCOUNT, // excluded — not enough discount
      ITEM_LOW_CONFIDENCE,   // excluded — lowConfidence
      ITEM_LOW_VALUE,        // excluded — below min value
      ITEM_ZERO_MIN,         // excluded — min <= 0
    ]);
    const results = scanSnipes(store, BASE_CONFIG);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Deep Discount Item');
  });
});
