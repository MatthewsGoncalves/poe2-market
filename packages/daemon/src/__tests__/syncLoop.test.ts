import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Config } from '../config.js';
import type { CacheStore } from '../cache/cacheStore.js';
import { CacheStore as RealCacheStore } from '../cache/cacheStore.js';
import type { MarketItem } from '../types.js';

vi.mock('../sync/poewatchClient.js', () => {
  class PoeWatchApiError extends Error {
    statusCode: number;
    responseBody: string;
    constructor(statusCode: number, responseBody: string) {
      super(`poe.watch API returned ${statusCode}: ${responseBody}`);
      this.name = 'PoeWatchApiError';
      this.statusCode = statusCode;
      this.responseBody = responseBody;
    }
  }
  return {
    fetchCompact: vi.fn(),
    fetchRates: vi.fn(),
    PoeWatchApiError,
  };
});

import { fetchCompact, fetchRates, PoeWatchApiError } from '../sync/poewatchClient.js';
import { startSyncLoop } from '../sync/syncLoop.js';

const mockedFetchCompact = vi.mocked(fetchCompact);
const mockedFetchRates = vi.mocked(fetchRates);

const MOCK_ITEMS: MarketItem[] = [
  { name: 'Headhunter', mean: 1000, min: 800, lowConfidence: false },
  { name: "Shavronne's Wrappings", mean: 500, min: 400, linkCount: 6, lowConfidence: false },
];
const MOCK_RATES = { divineInChaos: 160, exaltedInChaos: 10 };

const MIN_INTERVAL_MS = 600_000;

const BASE_CONFIG: Config = {
  league: 'TestLeague',
  game: 'poe2',
  syncIntervalMs: 1_200_000,
  snipeDiscountThreshold: 0.7,
  snipeMinValueChaos: 20,
  currencyErrorMinDivines: 1.5,
  currencyErrorTolerancePct: 0.2,
  daemonPort: 3001,
  poewatchBaseUrl: 'https://api.poe.watch',
};

let mockStore: {
  update: ReturnType<typeof vi.fn>;
  saveToDisk: ReturnType<typeof vi.fn>;
  getAll: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.useFakeTimers();
  mockStore = {
    update: vi.fn(),
    saveToDisk: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockReturnValue([]),
  };
  mockedFetchCompact.mockReset();
  mockedFetchRates.mockReset();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('startSyncLoop — immediate first sync', () => {
  it('calls fetchCompact and fetchRates immediately before the first interval fires', async () => {
    mockedFetchCompact.mockResolvedValueOnce(MOCK_ITEMS);
    mockedFetchRates.mockResolvedValueOnce(MOCK_RATES);

    const teardown = startSyncLoop(mockStore as unknown as CacheStore, BASE_CONFIG);

    // Drain all pending microtasks without advancing the timer clock
    await vi.advanceTimersByTimeAsync(0);

    expect(mockedFetchCompact).toHaveBeenCalledWith(
      BASE_CONFIG.league,
      BASE_CONFIG.game,
      BASE_CONFIG.poewatchBaseUrl,
    );
    expect(mockedFetchRates).toHaveBeenCalledWith(
      BASE_CONFIG.league,
      BASE_CONFIG.game,
      BASE_CONFIG.poewatchBaseUrl,
    );

    await teardown();
  });
});

describe('startSyncLoop — rates derived from compact', () => {
  it('uses Divine/Exalted Orb means from compact and skips fetchRates', async () => {
    const itemsWithCurrency: MarketItem[] = [
      ...MOCK_ITEMS,
      { name: 'Divine Orb', mean: 740, min: 700, lowConfidence: false },
      { name: 'Exalted Orb', mean: 5.6, min: 5, lowConfidence: false },
    ];
    mockedFetchCompact.mockResolvedValueOnce(itemsWithCurrency);

    const teardown = startSyncLoop(mockStore as unknown as CacheStore, BASE_CONFIG);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockedFetchRates).not.toHaveBeenCalled();
    expect(mockStore.update).toHaveBeenCalledWith(
      itemsWithCurrency,
      { divineInChaos: 740, exaltedInChaos: 5.6 },
      BASE_CONFIG.league,
    );

    await teardown();
  });
});

describe('startSyncLoop — disk persistence failure', () => {
  it('logs error and completes sync when saveToDisk() rejects', async () => {
    const diskError = new Error('rename failed');
    mockedFetchCompact.mockResolvedValueOnce(MOCK_ITEMS);
    mockedFetchRates.mockResolvedValueOnce(MOCK_RATES);
    mockStore.saveToDisk.mockRejectedValueOnce(diskError);

    const teardown = startSyncLoop(mockStore as unknown as CacheStore, BASE_CONFIG);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockStore.update).toHaveBeenCalledOnce();
    expect(mockStore.update).toHaveBeenCalledWith(MOCK_ITEMS, MOCK_RATES, BASE_CONFIG.league);
    expect(mockStore.saveToDisk).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(
      '[ERROR] Failed to persist cache to disk',
      { errorMessage: 'rename failed' },
    );
    expect(console.info).toHaveBeenCalledWith(
      '[INFO] Sync cycle completed',
      expect.objectContaining({ itemCount: 2 }),
    );

    await teardown();
  });
});

describe('startSyncLoop — successful fetch', () => {
  it('calls store.update() and store.saveToDisk() after a successful fetch', async () => {
    mockedFetchCompact.mockResolvedValueOnce(MOCK_ITEMS);
    mockedFetchRates.mockResolvedValueOnce(MOCK_RATES);

    const teardown = startSyncLoop(mockStore as unknown as CacheStore, BASE_CONFIG);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockStore.update).toHaveBeenCalledOnce();
    expect(mockStore.update).toHaveBeenCalledWith(MOCK_ITEMS, MOCK_RATES, BASE_CONFIG.league);
    expect(mockStore.saveToDisk).toHaveBeenCalledOnce();

    await teardown();
  });
});

describe('startSyncLoop — request timeout', () => {
  it('logs WARN and keeps stale cache when axios times out on both attempts', async () => {
    const timeoutError = Object.assign(new Error('timeout of 30000ms exceeded'), {
      code: 'ECONNABORTED',
    });
    mockedFetchCompact
      .mockRejectedValueOnce(timeoutError)
      .mockRejectedValueOnce(timeoutError);

    const teardown = startSyncLoop(mockStore as unknown as CacheStore, BASE_CONFIG);
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockedFetchCompact).toHaveBeenCalledTimes(2);
    expect(mockStore.update).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      '[WARN] Sync cycle failed',
      expect.objectContaining({
        errorMessage: 'timeout of 30000ms exceeded',
        usingStaleCache: true,
      }),
    );

    await teardown();
  });
});

describe('startSyncLoop — network error retry', () => {
  it('retries once after 5 seconds and calls store.update if retry succeeds', async () => {
    const networkError = new Error('connect ECONNREFUSED 127.0.0.1:80');
    mockedFetchCompact
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(MOCK_ITEMS);
    mockedFetchRates.mockResolvedValueOnce(MOCK_RATES);

    const teardown = startSyncLoop(mockStore as unknown as CacheStore, BASE_CONFIG);
    // Advance past the 5-second retry delay
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockedFetchCompact).toHaveBeenCalledTimes(2);
    expect(mockStore.update).toHaveBeenCalledOnce();
    expect(mockStore.update).toHaveBeenCalledWith(MOCK_ITEMS, MOCK_RATES, BASE_CONFIG.league);

    await teardown();
  });

  it('logs error and does NOT call store.update when both attempt and retry fail', async () => {
    const networkError = new Error('connect ECONNREFUSED 127.0.0.1:80');
    mockedFetchCompact
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError);

    const teardown = startSyncLoop(mockStore as unknown as CacheStore, BASE_CONFIG);
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockedFetchCompact).toHaveBeenCalledTimes(2);
    expect(mockStore.update).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      '[WARN] Sync cycle failed',
      expect.objectContaining({ usingStaleCache: true }),
    );

    await teardown();
  });
});

describe('startSyncLoop — empty compact response', () => {
  it('does NOT call store.update when compact returns zero items', async () => {
    mockedFetchCompact.mockResolvedValueOnce([]);
    mockedFetchRates.mockResolvedValueOnce(MOCK_RATES);

    const teardown = startSyncLoop(mockStore as unknown as CacheStore, BASE_CONFIG);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockStore.update).not.toHaveBeenCalled();
    expect(mockStore.saveToDisk).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      '[WARN] Sync cycle failed',
      expect.objectContaining({
        errorMessage: 'compact returned zero items',
        usingStaleCache: true,
      }),
    );

    await teardown();
  });
});

describe('startSyncLoop — API error (no retry)', () => {
  it('does NOT retry on a poe.watch 500 error and logs the failure', async () => {
    mockedFetchCompact.mockRejectedValueOnce(
      new PoeWatchApiError(500, 'Internal Server Error'),
    );

    const teardown = startSyncLoop(mockStore as unknown as CacheStore, BASE_CONFIG);
    // Advance past where a retry would have fired to confirm no retry happened
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockedFetchCompact).toHaveBeenCalledTimes(1);
    expect(mockStore.update).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      '[WARN] Sync cycle failed',
      expect.objectContaining({ usingStaleCache: true }),
    );

    await teardown();
  });
});

describe('startSyncLoop — overlapping sync guard', () => {
  it('skips interval tick when a previous sync cycle is still in flight', async () => {
    const minIntervalConfig = { ...BASE_CONFIG, syncIntervalMs: MIN_INTERVAL_MS };
    let resolveCompact!: (items: MarketItem[]) => void;
    mockedFetchCompact.mockImplementation(
      () => new Promise((resolve) => { resolveCompact = resolve; }),
    );
    mockedFetchRates.mockResolvedValue(MOCK_RATES);

    const teardown = startSyncLoop(mockStore as unknown as CacheStore, minIntervalConfig);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockedFetchCompact).toHaveBeenCalledTimes(1);

    // Interval fires while compact fetch is still pending
    await vi.advanceTimersByTimeAsync(MIN_INTERVAL_MS);
    expect(mockedFetchCompact).toHaveBeenCalledTimes(1);

    resolveCompact(MOCK_ITEMS);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockStore.update).toHaveBeenCalledOnce();

    await teardown();
  });
});

describe('startSyncLoop — minimum interval guard', () => {
  it('clamps syncIntervalMs = 60000 to 600,000 ms', async () => {
    const lowIntervalConfig = { ...BASE_CONFIG, syncIntervalMs: 60_000 };
    mockedFetchCompact.mockResolvedValue(MOCK_ITEMS);
    mockedFetchRates.mockResolvedValue(MOCK_RATES);

    const teardown = startSyncLoop(mockStore as unknown as CacheStore, lowIntervalConfig);

    // At 60,000ms the interval must NOT have fired (clamped to 600,000)
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockedFetchCompact).toHaveBeenCalledTimes(1); // only the immediate call

    // At 600,000ms the interval MUST fire
    await vi.advanceTimersByTimeAsync(540_000);
    expect(mockedFetchCompact).toHaveBeenCalledTimes(2);

    await teardown();
  });
});

describe('startSyncLoop — teardown', () => {
  it('returned teardown function clears the interval so no further calls occur', async () => {
    mockedFetchCompact.mockResolvedValue(MOCK_ITEMS);
    mockedFetchRates.mockResolvedValue(MOCK_RATES);

    const teardown = startSyncLoop(mockStore as unknown as CacheStore, BASE_CONFIG);

    await vi.advanceTimersByTimeAsync(0);
    expect(mockedFetchCompact).toHaveBeenCalledTimes(1);

    await teardown();

    // Advance well past multiple intervals; no new calls should occur
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(mockedFetchCompact).toHaveBeenCalledTimes(1);
  });
});

describe('startSyncLoop — teardown awaits in-flight sync', () => {
  it('waits for an in-flight sync to complete before teardown resolves', async () => {
    let resolveCompact!: (items: MarketItem[]) => void;
    mockedFetchCompact.mockImplementation(
      () => new Promise((resolve) => { resolveCompact = resolve; }),
    );
    mockedFetchRates.mockResolvedValue(MOCK_RATES);

    const teardown = startSyncLoop(mockStore as unknown as CacheStore, BASE_CONFIG);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockedFetchCompact).toHaveBeenCalledTimes(1);
    expect(mockStore.update).not.toHaveBeenCalled();

    const teardownPromise = teardown();
    let teardownResolved = false;
    void teardownPromise.then(() => { teardownResolved = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(teardownResolved).toBe(false);

    resolveCompact(MOCK_ITEMS);
    await vi.advanceTimersByTimeAsync(0);
    await teardownPromise;

    expect(mockStore.update).toHaveBeenCalledOnce();
    expect(teardownResolved).toBe(true);
  });
});

describe('startSyncLoop — league propagation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'poe-sync-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('updates store league from config when sync succeeds', async () => {
    mockedFetchCompact.mockResolvedValueOnce(MOCK_ITEMS);
    mockedFetchRates.mockResolvedValueOnce(MOCK_RATES);

    const store = new RealCacheStore('OldLeague', tmpDir);
    const newLeagueConfig: Config = {
      ...BASE_CONFIG,
      league: 'Runes of Aldur',
      poewatchLeague: 'Mirage',
    };

    const teardown = startSyncLoop(store, newLeagueConfig);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockedFetchCompact).toHaveBeenCalledWith(
      'Mirage',
      newLeagueConfig.game,
      newLeagueConfig.poewatchBaseUrl,
    );
    expect(store.getState().league).toBe('Runes of Aldur');
    await teardown();
  });
});

describe('integration — full sync cycle', () => {
  it('full cycle with mocked fetchCompact results in store.getAll() being populated', async () => {
    mockedFetchCompact.mockResolvedValueOnce(MOCK_ITEMS);
    mockedFetchRates.mockResolvedValueOnce(MOCK_RATES);

    let storedItems: MarketItem[] = [];
    const integrationStore = {
      update: vi.fn().mockImplementation((items: MarketItem[]) => {
        storedItems = [...items];
      }),
      saveToDisk: vi.fn().mockResolvedValue(undefined),
      getAll: vi.fn().mockImplementation(() => storedItems),
    } as unknown as CacheStore;

    const teardown = startSyncLoop(integrationStore, BASE_CONFIG);
    await vi.advanceTimersByTimeAsync(0);

    const all = storedItems;
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ name: 'Headhunter' });

    await teardown();
  });
});
