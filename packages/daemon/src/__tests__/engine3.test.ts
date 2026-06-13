import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectCurrencyErrors } from '../engines/engine3.js';
import { CacheStore } from '../cache/cacheStore.js';
import type { Config } from '../config.js';
import type { MarketItem } from '../types.js';

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

const RATES = { divineInChaos: 160, exaltedInChaos: 10 };

function makeStore(items: MarketItem[]): CacheStore {
  const store = new CacheStore(
    'TestLeague',
    join(tmpdir(), `engine3-test-${Math.floor(Math.random() * 1e9)}`),
  );
  store.update(items, RATES, 'TestLeague');
  return store;
}

const ITEM_EXACT_MATCH: MarketItem = {
  name: 'Exact Match Item',
  mean: 2400,
  min: 150,
  lowConfidence: false,
};

const ITEM_UPPER_BOUNDARY: MarketItem = {
  name: 'Upper Boundary Item',
  mean: 2400,
  min: 180,
  lowConfidence: false,
};

const ITEM_LOWER_BOUNDARY: MarketItem = {
  name: 'Lower Boundary Item',
  mean: 2400,
  min: 120,
  lowConfidence: false,
};

const ITEM_ABOVE_UPPER: MarketItem = {
  name: 'Above Upper Item',
  mean: 2400,
  min: 181,
  lowConfidence: false,
};

const ITEM_BELOW_LOWER: MarketItem = {
  name: 'Below Lower Item',
  mean: 2400,
  min: 119,
  lowConfidence: false,
};

const ITEM_BELOW_THRESHOLD: MarketItem = {
  name: 'Below Threshold Item',
  mean: 160,
  min: 10,
  lowConfidence: false,
};

const ITEM_LOW_CONFIDENCE: MarketItem = {
  name: 'Low Confidence Item',
  mean: 2400,
  min: 150,
  lowConfidence: true,
};

const ITEM_ZERO_MIN: MarketItem = {
  name: 'Zero Min Item',
  mean: 2400,
  min: 0,
  lowConfidence: false,
};

describe('detectCurrencyErrors() — divine/exalted (default)', () => {
  it('flags mean=2400c/min=150c with expectedAmount=15 divine and listedAsAmount=15 exalted', () => {
    const store = makeStore([ITEM_EXACT_MATCH]);
    const results = detectCurrencyErrors(store, RATES, BASE_CONFIG);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Exact Match Item');
    expect(results[0].expectedAmount).toBe(15);
    expect(results[0].expectedCurrency).toBe('divine');
    expect(results[0].listedMinChaos).toBe(150);
    expect(results[0].listedAsAmount).toBe(15);
    expect(results[0].mistakenCurrency).toBe('exalted');
  });

  it('flags mean=2400c/min=180c (exactly on +20% upper tolerance boundary)', () => {
    const store = makeStore([ITEM_UPPER_BOUNDARY]);
    const results = detectCurrencyErrors(store, RATES, BASE_CONFIG);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Upper Boundary Item');
  });

  it('flags mean=2400c/min=120c (exactly on -20% lower tolerance boundary)', () => {
    const store = makeStore([ITEM_LOWER_BOUNDARY]);
    const results = detectCurrencyErrors(store, RATES, BASE_CONFIG);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Lower Boundary Item');
  });
});

describe('detectCurrencyErrors() — exclusions', () => {
  it('does NOT flag mean=2400c/min=181c (just outside +20% tolerance)', () => {
    const store = makeStore([ITEM_ABOVE_UPPER]);
    expect(detectCurrencyErrors(store, RATES, BASE_CONFIG)).toHaveLength(0);
  });

  it('does NOT flag mean=2400c/min=119c (just outside -20% tolerance)', () => {
    const store = makeStore([ITEM_BELOW_LOWER]);
    expect(detectCurrencyErrors(store, RATES, BASE_CONFIG)).toHaveLength(0);
  });

  it('does NOT evaluate mean=160c (exactly 1 Divine, below the 1.5 Divine threshold)', () => {
    const store = makeStore([ITEM_BELOW_THRESHOLD]);
    expect(detectCurrencyErrors(store, RATES, BASE_CONFIG)).toHaveLength(0);
  });

  it('excludes a lowConfidence item even when min falls within the tolerance band', () => {
    const store = makeStore([ITEM_LOW_CONFIDENCE]);
    expect(detectCurrencyErrors(store, RATES, BASE_CONFIG)).toHaveLength(0);
  });

  it('excludes an item with min=0', () => {
    const store = makeStore([ITEM_ZERO_MIN]);
    expect(detectCurrencyErrors(store, RATES, BASE_CONFIG)).toHaveLength(0);
  });
});

describe('detectCurrencyErrors() — edge cases', () => {
  it('returns an empty array for an empty cache without error', () => {
    const store = makeStore([]);
    expect(detectCurrencyErrors(store, RATES, BASE_CONFIG)).toEqual([]);
  });

  it('returns only qualifying items from a mixed cache', () => {
    const store = makeStore([
      ITEM_EXACT_MATCH,
      ITEM_ABOVE_UPPER,
      ITEM_BELOW_LOWER,
      ITEM_BELOW_THRESHOLD,
      ITEM_LOW_CONFIDENCE,
      ITEM_ZERO_MIN,
    ]);
    const results = detectCurrencyErrors(store, RATES, BASE_CONFIG);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Exact Match Item');
  });

  it('falls back to exalted mistaken currency when expected equals mistaken', () => {
    const store = makeStore([ITEM_EXACT_MATCH]);
    const results = detectCurrencyErrors(store, RATES, BASE_CONFIG, {
      expectedCurrency: 'divine',
      mistakenCurrency: 'divine',
    });
    expect(results).toHaveLength(1);
    expect(results[0].mistakenCurrency).toBe('exalted');
  });
});

describe('detectCurrencyErrors() — computed fields', () => {
  it('computes listedAsAmount as min / exaltedInChaos (min=180 / 10 = 18)', () => {
    const store = makeStore([ITEM_UPPER_BOUNDARY]);
    const results = detectCurrencyErrors(store, RATES, BASE_CONFIG);
    expect(results[0].listedAsAmount).toBe(18);
  });

  it('computes expectedAmount as mean / divineInChaos (2400 / 160 = 15)', () => {
    const store = makeStore([ITEM_EXACT_MATCH]);
    const results = detectCurrencyErrors(store, RATES, BASE_CONFIG);
    expect(results[0].expectedAmount).toBe(15);
  });

  it('populates listedMinChaos from item.min', () => {
    const store = makeStore([ITEM_EXACT_MATCH]);
    const results = detectCurrencyErrors(store, RATES, BASE_CONFIG);
    expect(results[0].listedMinChaos).toBe(150);
  });
});

describe('detectCurrencyErrors() — custom currency pairs', () => {
  it('detects divine priced as chaos when min matches expected divines in chaos', () => {
    const item: MarketItem = {
      name: 'Divine Priced As Chaos',
      mean: 1600,
      min: 9,
      lowConfidence: false,
    };
    const store = makeStore([item]);
    const results = detectCurrencyErrors(store, RATES, BASE_CONFIG, {
      expectedCurrency: 'divine',
      mistakenCurrency: 'chaos',
    });
    expect(results).toHaveLength(1);
    expect(results[0].expectedAmount).toBe(10);
    expect(results[0].listedAsAmount).toBe(9);
    expect(results[0].mistakenCurrency).toBe('chaos');
  });
});
