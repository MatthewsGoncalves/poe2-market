import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveTradeItem,
  isKnownPoe2TradeItem,
  seedTradeItemIndexForTests,
  resetTradeItemIndexForTests,
  type TradeItemMatch,
} from '../sync/tradeItemIndex.js';

function makeIndex(): {
  loadedAt: number;
  byName: Map<string, TradeItemMatch>;
  byType: Map<string, TradeItemMatch>;
} {
  return {
    loadedAt: Date.now(),
    byName: new Map([
      ['Headhunter', { kind: 'unique', name: 'Headhunter' }],
      ['Mageblood', { kind: 'unique', name: 'Mageblood' }],
    ]),
    byType: new Map([
      ['Divine Orb', { kind: 'type', category: 'currency', type: 'Divine Orb' }],
      ['Fork', { kind: 'type', category: 'gem', type: 'Fork' }],
      ['Rain of Arrows', { kind: 'type', category: 'gem', type: 'Rain of Arrows' }],
    ]),
  };
}

describe('resolveTradeItem', () => {
  beforeEach(() => {
    resetTradeItemIndexForTests();
    seedTradeItemIndexForTests(makeIndex());
  });

  it('resolves uniques by exact name', () => {
    const index = makeIndex();
    expect(resolveTradeItem('Headhunter', index)).toEqual({ kind: 'unique', name: 'Headhunter' });
  });

  it('resolves currency by type name', () => {
    const index = makeIndex();
    expect(resolveTradeItem('Divine Orb', index)).toEqual({
      kind: 'type',
      category: 'currency',
      type: 'Divine Orb',
    });
  });

  it('maps support gems to their base gem type', () => {
    const index = makeIndex();
    expect(resolveTradeItem('Fork Support', index)).toEqual({
      kind: 'type',
      category: 'gem',
      type: 'Fork',
    });
  });

  it('returns null for items that are not on the PoE 2 trade site', () => {
    const index = makeIndex();
    expect(resolveTradeItem('Devouring Totem', index)).toBeNull();
    expect(resolveTradeItem("Shavronne's Wrappings", index)).toBeNull();
  });

  it('treats currency as known PoE 2 items', () => {
    const index = makeIndex();
    expect(isKnownPoe2TradeItem('Divine Orb', index)).toBe(true);
    expect(isKnownPoe2TradeItem('Devouring Totem', index)).toBe(false);
  });
});
