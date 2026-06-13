import { describe, it, expect } from 'vitest';
import { matchItemMods, buildPreciseQuery, buildFilteredTradeQuery } from '../sync/tradeQueryBuilder.js';
import { normalizeStatText, type StatEntry, type StatIndex } from '../sync/statIndex.js';
import type { TradeItemsCache } from '../sync/tradeItemIndex.js';
import { parseItemText } from '../sync/itemParser.js';

function makeStatIndex(entries: StatEntry[]): StatIndex {
  const byText = new Map<string, StatEntry[]>();
  for (const entry of entries) {
    const key = normalizeStatText(entry.text);
    const list = byText.get(key);
    if (list) list.push(entry);
    else byText.set(key, [entry]);
  }
  return { loadedAt: Date.now(), byText };
}

function makeItemIndex(): TradeItemsCache {
  return {
    loadedAt: Date.now(),
    byName: new Map([['Headhunter', { kind: 'unique', name: 'Headhunter' }]]),
    byType: new Map([
      ['Advanced Dualstring Bow', { kind: 'type', category: 'weapon.bow', type: 'Advanced Dualstring Bow' }],
      ['Leather Belt', { kind: 'type', category: 'accessory.belt', type: 'Leather Belt' }],
    ]),
  };
}

const STAT_INDEX = makeStatIndex([
  { id: 'explicit.stat_life', text: '# to maximum Life', group: 'explicit' },
  { id: 'explicit.stat_cold', text: '#% to Cold Resistance', group: 'explicit' },
  { id: 'implicit.stat_cold', text: '#% to Cold Resistance', group: 'implicit' },
  { id: 'explicit.stat_attack_speed', text: '#% increased Attack Speed', group: 'explicit' },
]);

const RARE_BOW = `Item Class: Bows
Rarity: Rare
Doom Roar
Advanced Dualstring Bow
--------
Item Level: 82
--------
+25 to maximum Life
+30% to Cold Resistance
12% increased Attack Speed`;

describe('matchItemMods', () => {
  it('resolves matched mods and marks unknown ones', () => {
    const parsed = parseItemText(`Item Class: Bows
Rarity: Rare
X
Advanced Dualstring Bow
--------
+25 to maximum Life
Some Unknown Mod`);
    const matched = matchItemMods(parsed, STAT_INDEX);
    expect(matched[0]).toMatchObject({ matched: true, statId: 'explicit.stat_life', value: 25 });
    expect(matched[1]).toMatchObject({ matched: false });
  });

  it('carries affix, tier and modName from advanced descriptions', () => {
    const parsed = parseItemText(`Item Class: Bows
Rarity: Rare
X
Advanced Dualstring Bow
--------
{ Prefix Modifier "Athlete's" (Tier: 2) — Life }
+25 to maximum Life`);
    const matched = matchItemMods(parsed, STAT_INDEX);
    expect(matched[0]).toMatchObject({
      matched: true,
      statId: 'explicit.stat_life',
      affix: 'prefix',
      tier: 2,
      modName: "Athlete's",
    });
  });
});

describe('buildPreciseQuery', () => {
  it('builds a rare query with type filter, rarity, and stat filters', () => {
    const parsed = parseItemText(RARE_BOW);
    const matched = matchItemMods(parsed, STAT_INDEX);
    const body = buildPreciseQuery(parsed, matched, makeItemIndex(), undefined) as {
      query: Record<string, any>;
      engine: string;
    };

    expect(body.query.status).toEqual({ option: 'any' });
    expect(body.query.type).toEqual('Advanced Dualstring Bow');
    expect(body.query.filters.type_filters.filters.category).toEqual({
      option: 'weapon.bow',
    });
    expect(body.query.filters.type_filters.filters.rarity).toEqual({ option: 'rare' });
    expect(body.engine).toBe('new');

    const statFilters = body.query.stats[0].filters;
    expect(statFilters).toEqual([
      { id: 'explicit.stat_life', disabled: false, value: { min: 25 } },
      { id: 'explicit.stat_cold', disabled: false, value: { min: 30 } },
      { id: 'explicit.stat_attack_speed', disabled: false, value: { min: 12 } },
    ]);
  });

  it('omits disabled mods and respects an overridden min', () => {
    const parsed = parseItemText(RARE_BOW);
    const matched = matchItemMods(parsed, STAT_INDEX);
    const body = buildPreciseQuery(parsed, matched, makeItemIndex(), {
      0: { enabled: true, min: 50 },
      1: { enabled: false },
      2: { enabled: true },
    }) as { query: Record<string, any> };

    const statFilters = body.query.stats[0].filters;
    expect(statFilters).toEqual([
      { id: 'explicit.stat_life', disabled: false, value: { min: 50 } },
      { id: 'explicit.stat_attack_speed', disabled: false, value: { min: 12 } },
    ]);
  });

  it('appends manually added extra stat filters', () => {
    const parsed = parseItemText(RARE_BOW);
    const matched = matchItemMods(parsed, STAT_INDEX);
    const body = buildPreciseQuery(parsed, matched, makeItemIndex(), { 1: { enabled: false }, 2: { enabled: false } }, {
      extraStats: [{ id: 'explicit.stat_extra', min: 5 }, { id: 'explicit.stat_noval' }],
    }) as { query: Record<string, any> };

    const statFilters = body.query.stats[0].filters;
    expect(statFilters).toEqual([
      { id: 'explicit.stat_life', disabled: false, value: { min: 25 } },
      { id: 'explicit.stat_extra', disabled: false, value: { min: 5 } },
      { id: 'explicit.stat_noval', disabled: false },
    ]);
  });

  it('uses the name filter for uniques', () => {
    const parsed = parseItemText(`Item Class: Belts
Rarity: Unique
Headhunter
Leather Belt
--------
+40 to maximum Life`);
    const matched = matchItemMods(parsed, STAT_INDEX);
    const body = buildPreciseQuery(parsed, matched, makeItemIndex(), undefined) as {
      query: Record<string, any>;
    };
    expect(body.query.name).toBe('Headhunter');
    expect(body.query.filters.type_filters.filters.rarity).toEqual({ option: 'unique' });
  });
});

describe('buildFilteredTradeQuery', () => {
  it('includes mod stat filters, gem options, and max price for snipe links', () => {
    const match = { kind: 'type' as const, category: 'weapon.bow', type: 'Advanced Dualstring Bow' };
    const body = buildFilteredTradeQuery(match, STAT_INDEX, {
      mods: ['+25 to maximum Life', '+30% to Cold Resistance'],
      gemLevel: 20,
      gemQuality: 20,
      corrupted: true,
      maxPriceChaos: 100,
    }) as { query: Record<string, any>; sort: Record<string, string>; engine: string };

    expect(body.sort).toEqual({ price: 'asc' });
    expect(body.engine).toBe('new');
    expect(body.query.stats[0].filters).toEqual([
      { id: 'explicit.stat_life', disabled: false, value: { min: 25 } },
      { id: 'explicit.stat_cold', disabled: false, value: { min: 30 } },
    ]);
    expect(body.query.filters.misc_filters.filters.gem_level).toEqual({ min: 20, max: 20 });
    expect(body.query.filters.trade_filters.filters.price).toEqual({ max: 105, option: 'chaos' });
  });
});
