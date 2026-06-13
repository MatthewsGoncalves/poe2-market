import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CacheStore } from '../cache/cacheStore.js';
import type { MarketItem, ExchangeRates } from '../types.js';

const RATES: ExchangeRates = { divineInChaos: 160, exaltedInChaos: 10 };

const ITEMS: MarketItem[] = [
  { name: "Shavronne's Wrappings", mean: 800, min: 500, linkCount: 6, lowConfidence: false },
  { name: "Shavronne's Wrappings", mean: 400, min: 200, linkCount: 5, lowConfidence: false },
  { name: 'Headhunter', mean: 1000, min: 800, lowConfidence: false },
  { name: 'Rare Jewel', mean: 5, min: 2, lowConfidence: true },
];

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'poe-cache-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('CacheStore.update()', () => {
  it('populates getAll() with the full items array', () => {
    const store = new CacheStore('TestLeague', tmpDir);
    store.update(ITEMS, RATES, 'TestLeague');
    expect(store.getAll()).toEqual(ITEMS);
  });

  it('replaces items on subsequent update() calls', () => {
    const store = new CacheStore('TestLeague', tmpDir);
    store.update(ITEMS, RATES, 'TestLeague');
    const newItems: MarketItem[] = [{ name: 'Chaos Orb', mean: 1, min: 1, lowConfidence: false }];
    store.update(newItems, RATES, 'TestLeague');
    expect(store.getAll()).toEqual(newItems);
    expect(store.getAll()).toHaveLength(1);
  });
});

describe('CacheStore.getByName()', () => {
  it('returns all items matching the name (multiple variants)', () => {
    const store = new CacheStore('TestLeague', tmpDir);
    store.update(ITEMS, RATES, 'TestLeague');
    const results = store.getByName("Shavronne's Wrappings");
    expect(results).toHaveLength(2);
    expect(results.map((i) => i.linkCount).sort()).toEqual([5, 6]);
  });

  it('returns empty array for an item name not in cache', () => {
    const store = new CacheStore('TestLeague', tmpDir);
    store.update(ITEMS, RATES, 'TestLeague');
    const results = store.getByName('NonExistentItem');
    expect(results).toEqual([]);
    expect(Array.isArray(results)).toBe(true);
  });

  it('returns empty array before any update()', () => {
    const store = new CacheStore('TestLeague', tmpDir);
    expect(store.getByName('Headhunter')).toEqual([]);
  });
});

describe('CacheStore.getState()', () => {
  it('returns ISO 8601 lastSyncAt after update()', () => {
    const store = new CacheStore('TestLeague', tmpDir);
    store.update(ITEMS, RATES, 'TestLeague');
    const state = store.getState();
    expect(state.lastSyncAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(() => new Date(state.lastSyncAt)).not.toThrow();
  });

  it('updates league on update() calls', () => {
    const store = new CacheStore('OldLeague', tmpDir);
    store.update(ITEMS, RATES, 'Mirage');
    expect(store.getState().league).toBe('Mirage');
  });

  it('replaces league when update() is called with a new league', () => {
    const store = new CacheStore('OldLeague', tmpDir);
    store.update(ITEMS, RATES, 'Return of the Ancients');
    store.update(ITEMS, RATES, 'Mirage');
    expect(store.getState().league).toBe('Mirage');
  });

  it('returns rates matching what was passed to update()', () => {
    const store = new CacheStore('TestLeague', tmpDir);
    store.update(ITEMS, RATES, 'TestLeague');
    const state = store.getState();
    expect(state.rates.divineInChaos).toBe(160);
    expect(state.rates.exaltedInChaos).toBe(10);
  });
});

describe('CacheStore.loadFromDisk()', () => {
  it('leaves store in empty state when cache.json does not exist', async () => {
    const store = new CacheStore('TestLeague', tmpDir);
    await expect(store.loadFromDisk('TestLeague')).resolves.toBeUndefined();
    expect(store.getAll()).toEqual([]);
  });

  it('logs a warning and leaves store in empty state when cache.json contains invalid JSON', async () => {
    writeFileSync(join(tmpDir, 'cache.json'), '{ this is not valid json }');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = new CacheStore('TestLeague', tmpDir);
    await store.loadFromDisk('TestLeague');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
    expect(store.getAll()).toEqual([]);
    warnSpy.mockRestore();
  });

  it('logs a warning and leaves store in empty state when cache.json is a JSON array', async () => {
    writeFileSync(join(tmpDir, 'cache.json'), JSON.stringify([1, 2, 3]));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = new CacheStore('TestLeague', tmpDir);
    await store.loadFromDisk('TestLeague');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
    expect(store.getAll()).toEqual([]);
    warnSpy.mockRestore();
  });

  it('restores items and rates from a valid cache.json', async () => {
    const stored = {
      items: ITEMS,
      rates: RATES,
      lastSyncAt: '2026-06-09T14:32:00.000Z',
      league: 'SavedLeague',
    };
    writeFileSync(join(tmpDir, 'cache.json'), JSON.stringify(stored));
    const store = new CacheStore('SavedLeague', tmpDir);
    await store.loadFromDisk('SavedLeague');
    expect(store.getAll()).toEqual(ITEMS);
    expect(store.getState().rates).toEqual(RATES);
    expect(store.getState().lastSyncAt).toBe('2026-06-09T14:32:00.000Z');
    expect(store.getState().league).toBe('SavedLeague');
  });

  it('ignores cache when league on disk does not match config league', async () => {
    const stored = {
      items: ITEMS,
      rates: RATES,
      lastSyncAt: '2026-06-09T14:32:00.000Z',
      league: 'Mirage',
    };
    writeFileSync(join(tmpDir, 'cache.json'), JSON.stringify(stored));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = new CacheStore('Runes of Aldur', tmpDir);
    await store.loadFromDisk('Runes of Aldur');
    expect(warnSpy).toHaveBeenCalledWith(
      '[WARN] cache.json league mismatch — ignoring stale cache',
      { cacheLeague: 'Mirage', expectedLeague: 'Runes of Aldur' },
    );
    expect(store.getAll()).toEqual([]);
    warnSpy.mockRestore();
  });

  it('rebuilds name index after load so getByName() works correctly', async () => {
    const stored = {
      items: ITEMS,
      rates: RATES,
      lastSyncAt: '2026-06-09T14:32:00.000Z',
      league: 'TestLeague',
    };
    writeFileSync(join(tmpDir, 'cache.json'), JSON.stringify(stored));
    const store = new CacheStore('TestLeague', tmpDir);
    await store.loadFromDisk('TestLeague');
    expect(store.getByName("Shavronne's Wrappings")).toHaveLength(2);
    expect(store.getByName('NonExistentItem')).toEqual([]);
  });
});

describe('CacheStore.saveToDisk()', () => {
  it('writes a valid JSON file that loadFromDisk() can read back correctly', async () => {
    const store = new CacheStore('TestLeague', tmpDir);
    store.update(ITEMS, RATES, 'TestLeague');
    await store.saveToDisk();

    const content = readFileSync(join(tmpDir, 'cache.json'), 'utf-8');
    const parsed = JSON.parse(content);
    expect(Array.isArray(parsed.items)).toBe(true);
    expect(parsed.items).toEqual(ITEMS);
    expect(parsed.rates).toEqual(RATES);
    expect(parsed.league).toBe('TestLeague');
    expect(parsed.lastSyncAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('creates the data directory if it does not exist', async () => {
    const nestedDir = join(tmpDir, 'nested', 'data');
    const store = new CacheStore('TestLeague', nestedDir);
    store.update(ITEMS, RATES, 'TestLeague');
    await store.saveToDisk();
    expect(existsSync(join(nestedDir, 'cache.json'))).toBe(true);
  });

  it('does not leave a .tmp file after a successful save', async () => {
    const store = new CacheStore('TestLeague', tmpDir);
    store.update(ITEMS, RATES, 'TestLeague');
    await store.saveToDisk();
    expect(existsSync(join(tmpDir, 'cache.json.tmp'))).toBe(false);
  });

  it('does not corrupt the original cache.json when rename fails', async () => {
    const store = new CacheStore('TestLeague', tmpDir);
    store.update(ITEMS, RATES, 'TestLeague');
    await store.saveToDisk();

    const originalContent = readFileSync(join(tmpDir, 'cache.json'), 'utf-8');

    const newItems: MarketItem[] = [{ name: 'New Item', mean: 1, min: 1, lowConfidence: false }];
    store.update(newItems, RATES, 'TestLeague');

    const renameSpy = vi.spyOn(fsp, 'rename').mockRejectedValueOnce(new Error('rename failed'));
    await expect(store.saveToDisk()).rejects.toThrow('rename failed');
    renameSpy.mockRestore();

    const currentContent = readFileSync(join(tmpDir, 'cache.json'), 'utf-8');
    expect(currentContent).toBe(originalContent);
  });
});

describe('CacheStore integration: saveToDisk → loadFromDisk round-trip', () => {
  it('produces identical getAll() output in a fresh store after loading from disk', async () => {
    const store1 = new CacheStore('TestLeague', tmpDir);
    store1.update(ITEMS, RATES, 'TestLeague');
    await store1.saveToDisk();

    const store2 = new CacheStore('TestLeague', tmpDir);
    await store2.loadFromDisk('TestLeague');

    expect(store2.getAll()).toEqual(store1.getAll());
  });

  it('preserves all CacheState fields across the round-trip', async () => {
    const store1 = new CacheStore('Return of the Ancients', tmpDir);
    store1.update(ITEMS, RATES, 'Return of the Ancients');
    await store1.saveToDisk();

    const state1 = store1.getState();

    const store2 = new CacheStore('Return of the Ancients', tmpDir);
    await store2.loadFromDisk('Return of the Ancients');
    const state2 = store2.getState();

    expect(state2.items).toEqual(state1.items);
    expect(state2.rates).toEqual(state1.rates);
    expect(state2.lastSyncAt).toBe(state1.lastSyncAt);
    expect(state2.league).toBe(state1.league);
  });

  it('getByName() works correctly in fresh store loaded from disk', async () => {
    const store1 = new CacheStore('TestLeague', tmpDir);
    store1.update(ITEMS, RATES, 'TestLeague');
    await store1.saveToDisk();

    const store2 = new CacheStore('TestLeague', tmpDir);
    await store2.loadFromDisk('TestLeague');

    expect(store2.getByName("Shavronne's Wrappings")).toHaveLength(2);
    expect(store2.getByName('Headhunter')).toHaveLength(1);
    expect(store2.getByName('NonExistentItem')).toEqual([]);
  });
});
