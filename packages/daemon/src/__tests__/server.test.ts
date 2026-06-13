import { describe, it, expect, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CacheStore } from '../cache/cacheStore.js';
import type { Config } from '../config.js';
import type { MarketItem } from '../types.js';
import { buildServer } from '../api/server.js';

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
