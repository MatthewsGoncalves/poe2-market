import { describe, it, expect } from 'vitest';
import {
  normalizeStatText,
  extractStatValues,
  resolveStat,
  searchStats,
  type StatIndex,
  type StatEntry,
} from '../sync/statIndex.js';

function makeIndex(entries: StatEntry[]): StatIndex {
  const byText = new Map<string, StatEntry[]>();
  for (const entry of entries) {
    const key = normalizeStatText(entry.text);
    const list = byText.get(key);
    if (list) list.push(entry);
    else byText.set(key, [entry]);
  }
  return { loadedAt: Date.now(), byText };
}

describe('normalizeStatText', () => {
  it('collapses signed and decimal numbers into # (case-insensitive)', () => {
    expect(normalizeStatText('+25 to maximum Life')).toBe('# to maximum life');
    expect(normalizeStatText('+25 to Maximum Life')).toBe('# to maximum life');
    expect(normalizeStatText('+30% to Cold Resistance')).toBe('#% to cold resistance');
    expect(normalizeStatText('Adds 5 to 12 Physical Damage')).toBe('adds # to # physical damage');
    expect(normalizeStatText('1.20% increased Attack Speed')).toBe('#% increased attack speed');
    expect(normalizeStatText('+10 to Spirit (augmented)')).toBe('# to spirit');
  });
});

describe('extractStatValues', () => {
  it('returns numeric rolls in order', () => {
    expect(extractStatValues('+25 to maximum Life')).toEqual([25]);
    expect(extractStatValues('Adds 5 to 12 Physical Damage')).toEqual([5, 12]);
    expect(extractStatValues('Corrupted')).toEqual([]);
  });
});

describe('resolveStat', () => {
  const index = makeIndex([
    { id: 'explicit.stat_life', text: '# to maximum Life', group: 'explicit' },
    { id: 'implicit.stat_life', text: '# to maximum Life', group: 'implicit' },
    { id: 'explicit.stat_cold', text: '#% to Cold Resistance', group: 'explicit' },
  ]);

  it('matches a rolled mod line to the explicit stat by default', () => {
    const entry = resolveStat('+25 to maximum Life', index);
    expect(entry?.id).toBe('explicit.stat_life');
  });

  it('prefers the group implied by the item tag', () => {
    const entry = resolveStat('+25 to maximum Life', index, 'implicit');
    expect(entry?.id).toBe('implicit.stat_life');
  });

  it('matches percentage resistance lines', () => {
    const entry = resolveStat('+30% to Cold Resistance', index);
    expect(entry?.id).toBe('explicit.stat_cold');
  });

  it('returns null for unknown text', () => {
    expect(resolveStat('Some Unknown Mod', index)).toBeNull();
  });
});

describe('searchStats', () => {
  const index = makeIndex([
    { id: 'explicit.stat_life', text: '# to maximum Life', group: 'explicit' },
    { id: 'implicit.stat_life', text: '# to maximum Life', group: 'implicit' },
    { id: 'explicit.stat_cold', text: '#% to Cold Resistance', group: 'explicit' },
  ]);

  it('returns nothing for an empty query', () => {
    expect(searchStats('', index)).toEqual([]);
  });

  it('finds matching stats by substring across groups', () => {
    const results = searchStats('maximum life', index);
    const ids = results.map((r) => r.id);
    expect(ids).toContain('explicit.stat_life');
    expect(ids).toContain('implicit.stat_life');
  });

  it('respects the result limit', () => {
    expect(searchStats('to', index, 1)).toHaveLength(1);
  });
});
