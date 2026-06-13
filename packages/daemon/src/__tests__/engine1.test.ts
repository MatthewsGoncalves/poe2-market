import { describe, it, expect, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CacheStore } from '../cache/cacheStore.js';
import type { ExchangeRates, ItemEvaluation, MarketItem } from '../types.js';
import { evaluate } from '../engines/engine1.js';

const RATES: ExchangeRates = { divineInChaos: 160, exaltedInChaos: 10 };

// Inline MarketItem fixtures — compact.json is in raw poe.watch format and cannot be
// used directly as MarketItem[]. These fixtures cover all required test scenarios.
const ITEMS: MarketItem[] = [
  { name: "Shavronne's Wrappings", mean: 1200, min: 950, lowConfidence: false },
  { name: 'Devouring Totem', mean: 45, min: 35, gemLevel: 20, gemIsCorrupted: false, lowConfidence: false },
  { name: 'Devouring Totem', mean: 280, min: 250, gemLevel: 21, gemIsCorrupted: true, lowConfidence: false },
  { name: 'Six Link Chest', mean: 800, min: 600, linkCount: 5, lowConfidence: false },
  { name: 'Six Link Chest', mean: 1500, min: 1200, linkCount: 6, lowConfidence: false },
  { name: 'Rare Synthesised Jewel', mean: 5, min: 2, lowConfidence: true },
  // Higher-mean variant first so reduce exercises the "keep best" (false) branch
  { name: 'Multi Variant Item', mean: 200, min: 150, lowConfidence: false },
  { name: 'Multi Variant Item', mean: 100, min: 80, lowConfidence: false },
  // Gem quality filter fixtures
  { name: 'Quality Gem', mean: 100, min: 80, gemQuality: 20, lowConfidence: false },
  { name: 'Quality Gem', mean: 20, min: 15, gemQuality: 0, lowConfidence: false },
  // gemIsCorrupted-only filter fixtures (no gemLevel to short-circuit earlier)
  { name: 'Corrupted Gem', mean: 50, min: 40, gemIsCorrupted: true, lowConfidence: false },
  { name: 'Corrupted Gem', mean: 30, min: 20, gemIsCorrupted: false, lowConfidence: false },
];

let store: CacheStore;

beforeEach(() => {
  store = new CacheStore('TestLeague', join(tmpdir(), 'engine1-test'));
  store.update(ITEMS, RATES, 'TestLeague');
});

describe("evaluate() — Shavronne's Wrappings (no filters)", () => {
  it('returns correct meanChaos, minChaos, meanDivine, and suggestedListPrice', () => {
    const result = evaluate("Shavronne's Wrappings", {}, store, RATES);
    expect(result).toMatchObject({
      found: true,
      name: "Shavronne's Wrappings",
      meanChaos: 1200,
      minChaos: 950,
      meanDivine: 7.5,
      suggestedListPrice: 1200,
      lowConfidence: false,
    });
  });
});

describe('evaluate() — gem variant filtering', () => {
  it('returns the level-21 corrupted variant when gemLevel: 21 and gemIsCorrupted: true', () => {
    const result = evaluate('Devouring Totem', { gemLevel: 21, gemIsCorrupted: true }, store, RATES);
    expect(result).toMatchObject({
      found: true,
      meanChaos: 280,
      minChaos: 250,
    });
  });

  it('does not return the level-21 entry when gemLevel: 20 is specified', () => {
    const result = evaluate('Devouring Totem', { gemLevel: 20, gemIsCorrupted: false }, store, RATES);
    expect(result).toMatchObject({ found: true, meanChaos: 45 });
  });
});

describe('evaluate() — linkCount filtering', () => {
  it('returns the 6-link variant when linkCount: 6 is specified', () => {
    const result = evaluate('Six Link Chest', { linkCount: 6 }, store, RATES);
    expect(result).toMatchObject({
      found: true,
      meanChaos: 1500,
      minChaos: 1200,
    });
  });
});

describe('evaluate() — not found', () => {
  it('returns { found: false, name } for an unknown item name', () => {
    const result = evaluate('NonExistentItem', {}, store, RATES);
    expect(result).toMatchObject({ found: false, name: 'NonExistentItem' });
  });

  it('returns { found: false, name } when property filter eliminates all variants', () => {
    const result = evaluate('Six Link Chest', { linkCount: 4 }, store, RATES);
    expect(result).toMatchObject({ found: false, name: 'Six Link Chest' });
  });
});

describe('evaluate() — lowConfidence propagation', () => {
  it('propagates lowConfidence: true from the matching MarketItem to the result', () => {
    const result = evaluate('Rare Synthesised Jewel', {}, store, RATES);
    expect(result).toMatchObject({ found: true, lowConfidence: true });
  });
});

describe('evaluate() — meanDivine rounding', () => {
  it('rounds meanDivine to 2 decimal places (45 / 160 = 0.28125 → 0.28)', () => {
    const result = evaluate('Devouring Totem', { gemLevel: 20 }, store, RATES);
    expect(result).toMatchObject({ found: true });
    expect((result as ItemEvaluation).meanDivine).toBe(0.28);
  });
});

describe('evaluate() — multi-variant disambiguation', () => {
  it('returns highest-mean variant when it appears first in the store (reduce keeps best)', () => {
    // Multi Variant Item fixture: [mean=200, mean=100] — second item does not beat first
    const result = evaluate('Multi Variant Item', {}, store, RATES);
    expect(result).toMatchObject({ found: true, meanChaos: 200 });
  });

  it('returns highest-mean variant when it appears second in the store (reduce picks curr)', () => {
    // Devouring Totem fixture: [mean=45, mean=280] — second item beats first
    const result = evaluate('Devouring Totem', {}, store, RATES);
    expect(result).toMatchObject({ found: true, meanChaos: 280 });
  });
});

describe('evaluate() — gemQuality filtering', () => {
  it('returns only the variant matching the specified gemQuality', () => {
    const result = evaluate('Quality Gem', { gemQuality: 20 }, store, RATES);
    expect(result).toMatchObject({ found: true, meanChaos: 100 });
  });

  it('returns { found: false } when gemQuality filter matches no variant', () => {
    const result = evaluate('Quality Gem', { gemQuality: 23 }, store, RATES);
    expect(result).toMatchObject({ found: false, name: 'Quality Gem' });
  });
});

describe('evaluate() — gemIsCorrupted filtering (without gemLevel)', () => {
  it('returns non-gem items when gemIsCorrupted: false is specified (undefined is not corrupted)', () => {
    const result = evaluate("Shavronne's Wrappings", { gemIsCorrupted: false }, store, RATES);
    expect(result).toMatchObject({ found: true, meanChaos: 1200 });
  });

  it('returns only the non-corrupted variant when gemIsCorrupted: false is specified alone', () => {
    const result = evaluate('Corrupted Gem', { gemIsCorrupted: false }, store, RATES);
    expect(result).toMatchObject({ found: true, meanChaos: 30 });
  });

  it('returns only the corrupted variant when gemIsCorrupted: true is specified alone', () => {
    const result = evaluate('Corrupted Gem', { gemIsCorrupted: true }, store, RATES);
    expect(result).toMatchObject({ found: true, meanChaos: 50 });
  });
});
