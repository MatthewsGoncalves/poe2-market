import { describe, it, expect } from 'vitest';
import { filterPoe2MarketItemsWithIndex } from '../sync/poe2ItemFilter.js';
import type { TradeItemsCache } from '../sync/tradeItemIndex.js';
import type { MarketItem } from '../types.js';

function makeIndex(): TradeItemsCache {
  return {
    loadedAt: Date.now(),
    byName: new Map([['Headhunter', { kind: 'unique', name: 'Headhunter' }]]),
    byType: new Map([
      ['Divine Orb', { kind: 'type', category: 'currency', type: 'Divine Orb' }],
      ['Fork', { kind: 'type', category: 'gem', type: 'Fork' }],
    ]),
  };
}

describe('filterPoe2MarketItemsWithIndex', () => {
  it('keeps PoE 2 trade items and currency', () => {
    const items: MarketItem[] = [
      { name: 'Headhunter', mean: 1000, min: 800, lowConfidence: false },
      { name: 'Divine Orb', mean: 160, min: 150, lowConfidence: false },
      { name: "Shavronne's Wrappings", mean: 500, min: 400, lowConfidence: false },
    ];

    const filtered = filterPoe2MarketItemsWithIndex(items, makeIndex());

    expect(filtered.map((item) => item.name)).toEqual(['Headhunter', 'Divine Orb']);
  });

  it('keeps support gems mapped to PoE 2 gem types', () => {
    const items: MarketItem[] = [
      { name: 'Fork Support', mean: 3, min: 2, lowConfidence: false },
      { name: 'Devouring Totem', mean: 2000, min: 1500, lowConfidence: false },
    ];

    const filtered = filterPoe2MarketItemsWithIndex(items, makeIndex());

    expect(filtered.map((item) => item.name)).toEqual(['Fork Support']);
  });
});
