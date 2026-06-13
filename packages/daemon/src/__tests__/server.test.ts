import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CacheStore } from '../cache/cacheStore.js';
import type { Config } from '../config.js';
import type { MarketItem } from '../types.js';
import { buildServer } from '../api/server.js';

vi.mock('../sync/tradeLink.js', () => ({
  resolveTradeSearchUrl: vi.fn(),
  resolvePreciseTradeUrl: vi.fn(),
}));

import { resolveTradeSearchUrl, resolvePreciseTradeUrl } from '../sync/tradeLink.js';
import { seedStatIndexForTests, normalizeStatText, type StatEntry } from '../sync/statIndex.js';
import { seedTradeItemIndexForTests } from '../sync/tradeItemIndex.js';

beforeEach(() => {
  vi.clearAllMocks();
});

function seedIndexes(): void {
  const entries: StatEntry[] = [
    { id: 'explicit.stat_life', text: '# to maximum Life', group: 'explicit' },
    { id: 'explicit.stat_cold', text: '#% to Cold Resistance', group: 'explicit' },
  ];
  const byText = new Map<string, StatEntry[]>();
  for (const e of entries) byText.set(normalizeStatText(e.text), [e]);
  seedStatIndexForTests({ loadedAt: Date.now(), byText });

  seedTradeItemIndexForTests({
    loadedAt: Date.now(),
    byName: new Map([['Headhunter', { kind: 'unique', name: 'Headhunter' }]]),
    byType: new Map([
      ['Leather Belt', { kind: 'type', category: 'accessory.belt', type: 'Leather Belt' }],
    ]),
  });
}

const PASTED_ITEM = `Item Class: Belts
Rarity: Rare
Doom Coil
Leather Belt
--------
Item Level: 80
--------
+25 to maximum Life
+30% to Cold Resistance`;

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

// min/mean = 500/800 = 0.625 → qualifies as snipe (threshold 0.70)
const SNIPE_ITEM_A: MarketItem = {
  name: 'Shavronne\'s Wrappings',
  mean: 800,
  min: 500,
  linkCount: 6,
  lowConfidence: false,
};

// profit 100 < profit 300 from A
const SNIPE_ITEM_B: MarketItem = {
  name: 'Tabula Rasa',
  mean: 300,
  min: 200,
  linkCount: 0,
  lowConfidence: false,
};

// mean > 1.5 * 160 = 240; min ≈ expectedDivines * exaltedInChaos within 20% tolerance
// mean=400 → expectedDivines=2.5 → equivalentExaltedPrice=25 → tolerance band [20, 30]
// min=24 is in [20, 30] → flagged
const CURRENCY_ERROR_ITEM: MarketItem = {
  name: 'Mageblood',
  mean: 400,
  min: 24,
  lowConfidence: false,
};

const TEST_ITEM: MarketItem = {
  name: 'TestItem',
  mean: 240,
  min: 180,
  lowConfidence: false,
};

function makeStore(items: MarketItem[]): CacheStore {
  const s = new CacheStore('TestLeague', join(tmpdir(), `server-test-${Math.floor(Math.random() * 1e9)}`));
  s.update(items, RATES, 'TestLeague');
  return s;
}

describe('GET /api/health', () => {
  it('returns 200 { ok: true }', async () => {
    const store = makeStore([]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('logs API request received with method, path, and durationMs', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const store = makeStore([]);
    const app = buildServer(store, BASE_CONFIG);
    await app.inject({ method: 'GET', url: '/api/health' });

    const requestLog = infoSpy.mock.calls.find(
      ([message]) => message === '[INFO] API request received',
    );
    expect(requestLog).toBeDefined();
    expect(requestLog?.[1]).toMatchObject({
      method: 'GET',
      path: '/api/health',
      durationMs: expect.any(Number),
    });

    infoSpy.mockRestore();
  });
});

describe('GET /api/status', () => {
  it('returns correct league, lastSyncAt, itemCount, rates and stale: false for a recent sync', async () => {
    const store = makeStore([SNIPE_ITEM_A]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.league).toBe('TestLeague');
    expect(body.itemCount).toBe(1);
    expect(body.rates).toEqual(RATES);
    expect(typeof body.lastSyncAt).toBe('string');
    expect(body.stale).toBe(false);
  });

  it('returns stale: true when lastSyncAt is more than 2 × syncIntervalMs in the past', async () => {
    const store = new CacheStore('TestLeague', join(tmpdir(), `server-stale-test-${Math.floor(Math.random() * 1e9)}`));
    // Manually set an old lastSyncAt via update then mutate through getState (we need to fake old time)
    // Use a config with a tiny syncIntervalMs so any real update timestamp is stale
    const staleConfig: Config = { ...BASE_CONFIG, syncIntervalMs: 1 }; // 1ms interval → 2ms threshold
    store.update([SNIPE_ITEM_A], RATES, 'TestLeague');
    // Wait a tiny bit to ensure we exceed 2 × 1ms
    await new Promise((r) => setTimeout(r, 10));
    const app = buildServer(store, staleConfig);
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().stale).toBe(true);
  });

  it('returns stale: true when store has never been synced (empty lastSyncAt)', async () => {
    // New store, no update called → lastSyncAt is ''
    const store = new CacheStore('TestLeague', join(tmpdir(), `server-notsync-test-${Math.floor(Math.random() * 1e9)}`));
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().stale).toBe(true);
  });
});

describe('GET /api/snipes', () => {
  it('returns sorted results with profitChaos and discountPct fields', async () => {
    const store = makeStore([SNIPE_ITEM_A, SNIPE_ITEM_B]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({ method: 'GET', url: '/api/snipes' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results[0].profitChaos).toBeGreaterThan(body.results[1].profitChaos);
    expect(typeof body.results[0].discountPct).toBe('number');
    expect(typeof body.generatedAt).toBe('string');
  });

  it('filters by minProfit query param', async () => {
    const store = makeStore([SNIPE_ITEM_A, SNIPE_ITEM_B]);
    const app = buildServer(store, BASE_CONFIG);
    // SNIPE_ITEM_A profit=300, SNIPE_ITEM_B profit=100 → only A passes minProfit=200
    const res = await app.inject({ method: 'GET', url: '/api/snipes?minProfit=200' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].name).toBe("Shavronne's Wrappings");
  });

  it('caps results at maxResults query param', async () => {
    const store = makeStore([SNIPE_ITEM_A, SNIPE_ITEM_B]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({ method: 'GET', url: '/api/snipes?maxResults=1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().results).toHaveLength(1);
  });

  it('returns empty results for an empty cache', async () => {
    const store = makeStore([]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({ method: 'GET', url: '/api/snipes' });
    expect(res.statusCode).toBe(200);
    expect(res.json().results).toEqual([]);
  });

  it('logs Engine 2 scan result with opportunityCount and topProfit', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const store = makeStore([SNIPE_ITEM_A, SNIPE_ITEM_B]);
    const app = buildServer(store, BASE_CONFIG);
    await app.inject({ method: 'GET', url: '/api/snipes' });

    const scanLog = infoSpy.mock.calls.find(
      ([message]) => message === '[INFO] Engine 2 scan result',
    );
    expect(scanLog).toBeDefined();
    expect(scanLog?.[1]).toMatchObject({
      opportunityCount: 2,
      topProfit: 300,
    });

    infoSpy.mockRestore();
  });
});

describe('GET /api/evaluate', () => {
  it('returns correct ItemEvaluation for a seeded store', async () => {
    const store = makeStore([TEST_ITEM]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({ method: 'GET', url: '/api/evaluate?name=TestItem' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.found).toBe(true);
    expect(body.name).toBe('TestItem');
    expect(body.meanChaos).toBe(240);
    expect(body.minChaos).toBe(180);
    expect(body.meanDivine).toBe(1.5);
    expect(body.lowConfidence).toBe(false);
  });

  it('returns 400 with descriptive error when name is missing', async () => {
    const store = makeStore([]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({ method: 'GET', url: '/api/evaluate' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toMatch(/name/i);
  });

  it('returns { found: false } for an item not in the cache', async () => {
    const store = makeStore([]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({ method: 'GET', url: '/api/evaluate?name=Unknown' });
    expect(res.statusCode).toBe(200);
    expect(res.json().found).toBe(false);
  });

  it('returns found: true for a non-gem item when corrupted=false is specified', async () => {
    const store = makeStore([SNIPE_ITEM_A]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({
      method: 'GET',
      url: "/api/evaluate?name=Shavronne's+Wrappings&corrupted=false",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ found: true, name: "Shavronne's Wrappings", meanChaos: 800 });
  });
});

describe('GET /api/currency-errors', () => {
  it('returns empty alerts when no currency errors exist in seeded cache', async () => {
    const store = makeStore([TEST_ITEM]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({ method: 'GET', url: '/api/currency-errors' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.alerts).toEqual([]);
    expect(typeof body.generatedAt).toBe('string');
  });

  it('returns the flagged item when the cache contains a mathematically matching entry', async () => {
    const store = makeStore([CURRENCY_ERROR_ITEM]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({ method: 'GET', url: '/api/currency-errors' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0].name).toBe('Mageblood');
  });

  it('logs Engine 3 alert found with itemName, listedMinChaos, and expectedAmount', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = makeStore([CURRENCY_ERROR_ITEM]);
    const app = buildServer(store, BASE_CONFIG);
    await app.inject({ method: 'GET', url: '/api/currency-errors' });

    const alertLog = warnSpy.mock.calls.find(
      ([message]) => message === '[WARN] Engine 3 alert found',
    );
    expect(alertLog).toBeDefined();
    expect(alertLog?.[1]).toMatchObject({
      itemName: 'Mageblood',
      listedMinChaos: 24,
      expectedAmount: 2.5,
      expectedCurrency: 'divine',
    });

    warnSpy.mockRestore();
  });

  it('accepts expected and mistaken query params for currency pair', async () => {
    const store = makeStore([CURRENCY_ERROR_ITEM]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({
      method: 'GET',
      url: '/api/currency-errors?expected=divine&mistaken=exalted',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().alerts).toHaveLength(1);
  });
});

describe('GET /api/trade-link', () => {
  it('redirects to the official trade site search URL', async () => {
    vi.mocked(resolveTradeSearchUrl).mockResolvedValue(
      'https://www.pathofexile.com/trade2/search/poe2/Runes%20of%20Aldur/L6XwDWBSn',
    );

    const store = makeStore([]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({
      method: 'GET',
      url: '/api/trade-link?league=Runes%20of%20Aldur&name=Headhunter',
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(
      'https://www.pathofexile.com/trade2/search/poe2/Runes%20of%20Aldur/L6XwDWBSn',
    );
    expect(resolveTradeSearchUrl).toHaveBeenCalledWith('Runes of Aldur', 'Headhunter', {});
  });

  it('forwards mod lines and max price filters to resolveTradeSearchUrl', async () => {
    vi.mocked(resolveTradeSearchUrl).mockResolvedValue(
      'https://www.pathofexile.com/trade2/search/poe2/Runes%20of%20Aldur/filtered',
    );

    const store = makeStore([]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({
      method: 'GET',
      url: '/api/trade-link?league=Runes%20of%20Aldur&name=Headhunter&maxPrice=520&mods=%2B25%20to%20maximum%20Life',
    });

    expect(res.statusCode).toBe(302);
    expect(resolveTradeSearchUrl).toHaveBeenCalledWith('Runes of Aldur', 'Headhunter', {
      maxPriceChaos: 520,
      mods: ['+25 to maximum Life'],
    });
  });

  it('redirects with precise filters when itemText is provided', async () => {
    seedIndexes();
    vi.mocked(resolvePreciseTradeUrl).mockResolvedValue({
      url: 'https://www.pathofexile.com/trade2/search/poe2/TestLeague/precise123',
      total: 3,
    });

    const store = makeStore([]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({
      method: 'GET',
      url: `/api/trade-link?league=TestLeague&itemText=${encodeURIComponent(PASTED_ITEM)}`,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('precise123');
    expect(resolvePreciseTradeUrl).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/parse-item', () => {
  it('parses pasted item text and returns matched mods', async () => {
    seedIndexes();
    const store = makeStore([]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({
      method: 'POST',
      url: '/api/parse-item',
      payload: { itemText: PASTED_ITEM },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.parsed.rarity).toBe('Rare');
    expect(body.parsed.baseType).toBe('Leather Belt');
    expect(body.matchedMods).toHaveLength(2);
    expect(body.matchedMods[0]).toMatchObject({ matched: true, statId: 'explicit.stat_life' });
  });

  it('resolves the item icon from the market cache by base type', async () => {
    seedIndexes();
    const store = makeStore([
      { name: 'Leather Belt', mean: 5, min: 4, lowConfidence: false, icon: 'https://cdn/belt.png' },
    ]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({
      method: 'POST',
      url: '/api/parse-item',
      payload: { itemText: PASTED_ITEM },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().parsed.icon).toBe('https://cdn/belt.png');
  });

  it('returns 400 when itemText is missing', async () => {
    const store = makeStore([]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({ method: 'POST', url: '/api/parse-item', payload: {} });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/item-names', () => {
  it('returns matching names from the cache (with icon) and the trade index', async () => {
    seedIndexes();
    const store = makeStore([
      { name: 'Leather Belt', mean: 5, min: 4, lowConfidence: false, icon: 'https://cdn/belt.png' },
    ]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({ method: 'GET', url: '/api/item-names?q=lea' });
    expect(res.statusCode).toBe(200);
    const names = res.json().results as { name: string; icon?: string }[];
    const belt = names.find((n) => n.name === 'Leather Belt');
    expect(belt?.icon).toBe('https://cdn/belt.png');
  });

  it('returns empty results for short queries', async () => {
    const store = makeStore([]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({ method: 'GET', url: '/api/item-names?q=a' });
    expect(res.statusCode).toBe(200);
    expect(res.json().results).toEqual([]);
  });
});

describe('GET /api/stats', () => {
  it('returns matching stat suggestions', async () => {
    seedIndexes();
    const store = makeStore([]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({ method: 'GET', url: '/api/stats?q=maximum%20life' });
    expect(res.statusCode).toBe(200);
    const ids = (res.json().results as { id: string }[]).map((r) => r.id);
    expect(ids).toContain('explicit.stat_life');
  });
});

describe('POST /api/trade-search', () => {
  it('builds a precise query and returns the resolved url and total', async () => {
    seedIndexes();
    vi.mocked(resolvePreciseTradeUrl).mockResolvedValue({
      url: 'https://www.pathofexile.com/trade2/search/poe2/TestLeague/abc123',
      total: 7,
    });

    const store = makeStore([]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({
      method: 'POST',
      url: '/api/trade-search',
      payload: { league: 'TestLeague', itemText: PASTED_ITEM },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.url).toContain('/abc123');
    expect(body.total).toBe(7);
    expect(resolvePreciseTradeUrl).toHaveBeenCalledTimes(1);

    const [league, queryBody] = vi.mocked(resolvePreciseTradeUrl).mock.calls[0]!;
    expect(league).toBe('TestLeague');
    expect((queryBody as any).engine).toBe('new');
    expect((queryBody as any).query.stats[0].filters).toEqual([
      { id: 'explicit.stat_life', disabled: false, value: { min: 25 } },
      { id: 'explicit.stat_cold', disabled: false, value: { min: 30 } },
    ]);
  });

  it('redirects precise searches via POST /api/trade-link', async () => {
    seedIndexes();
    vi.mocked(resolvePreciseTradeUrl).mockResolvedValue({
      url: 'https://www.pathofexile.com/trade2/search/poe2/TestLeague/post123',
      total: 2,
    });

    const store = makeStore([]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({
      method: 'POST',
      url: '/api/trade-link',
      payload: { league: 'TestLeague', itemText: PASTED_ITEM },
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('post123');
    expect(resolvePreciseTradeUrl).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when league or itemText is missing', async () => {
    const store = makeStore([]);
    const app = buildServer(store, BASE_CONFIG);
    const res = await app.inject({
      method: 'POST',
      url: '/api/trade-search',
      payload: { itemText: PASTED_ITEM },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Integration — server starts and responds', () => {
  it('server starts on configured port and responds to GET /api/health with 200', async () => {
    const store = makeStore([]);
    const app = buildServer(store, BASE_CONFIG);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    await app.close();
  });
});
