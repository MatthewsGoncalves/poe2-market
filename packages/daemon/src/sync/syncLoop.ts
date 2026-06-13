import type { CacheStore } from '../cache/cacheStore.js';
import type { Config } from '../config.js';
import type { MarketItem, ExchangeRates } from '../types.js';
import { poewatchLeagueId } from './leagueValidation.js';
import { fetchCompact, fetchRates, PoeWatchApiError } from './poewatchClient.js';

const MIN_INTERVAL_MS = 600_000;
const RETRY_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The /exchange/ratios endpoint rejects some valid leagues (e.g. "Mirage" with
 * game=poe2 returns "league not found"), so prefer deriving the rates from the
 * compact payload itself, where Divine/Exalted Orbs carry their chaos mean.
 */
function ratesFromItems(items: MarketItem[]): ExchangeRates | null {
  const divine = items.find((i) => i.name === 'Divine Orb' && i.mean > 0);
  const exalted = items.find((i) => i.name === 'Exalted Orb' && i.mean > 0);
  if (!divine || !exalted) return null;
  return { divineInChaos: divine.mean, exaltedInChaos: exalted.mean };
}

async function attemptFetch(
  config: Config,
): Promise<{ items: MarketItem[]; rates: ExchangeRates }> {
  const dataLeague = poewatchLeagueId(config);
  const items = await fetchCompact(dataLeague, config.game, config.poewatchBaseUrl);
  const rates =
    ratesFromItems(items) ??
    (await fetchRates(dataLeague, config.game, config.poewatchBaseUrl));
  return { items, rates };
}

async function fetchWithRetry(
  config: Config,
): Promise<{ items: MarketItem[]; rates: ExchangeRates } | null> {
  try {
    return await attemptFetch(config);
  } catch (err) {
    if (err instanceof PoeWatchApiError) {
      console.warn('[WARN] Sync cycle failed', {
        errorMessage: err.message,
        usingStaleCache: true,
      });
      return null;
    }
    // Network error — one retry after RETRY_DELAY_MS
    await sleep(RETRY_DELAY_MS);
    try {
      return await attemptFetch(config);
    } catch (retryErr) {
      const errorMessage = retryErr instanceof Error ? retryErr.message : String(retryErr);
      console.warn('[WARN] Sync cycle failed', { errorMessage, usingStaleCache: true });
      return null;
    }
  }
}

async function runSync(store: CacheStore, config: Config): Promise<void> {
  const startMs = Date.now();
  console.info('[INFO] Sync cycle started', {
    league: config.league,
    timestamp: new Date().toISOString(),
  });

  const result = await fetchWithRetry(config);
  if (result === null) return;

  if (result.items.length === 0) {
    console.warn('[WARN] Sync cycle failed', {
      errorMessage: 'compact returned zero items',
      usingStaleCache: true,
    });
    return;
  }

  store.update(result.items, result.rates, config.league);
  try {
    await store.saveToDisk();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[ERROR] Failed to persist cache to disk', { errorMessage });
  }

  const durationMs = Date.now() - startMs;
  console.info('[INFO] Sync cycle completed', {
    itemCount: result.items.length,
    divineInChaos: result.rates.divineInChaos,
    exaltedInChaos: result.rates.exaltedInChaos,
    durationMs,
  });
}

export function startSyncLoop(store: CacheStore, config: Config): () => Promise<void> {
  const intervalMs = Math.max(MIN_INTERVAL_MS, config.syncIntervalMs);
  let syncInFlight = false;
  let currentSyncPromise: Promise<void> | null = null;

  async function guardedRunSync(): Promise<void> {
    if (syncInFlight) return;
    syncInFlight = true;
    const syncPromise = runSync(store, config);
    currentSyncPromise = syncPromise;
    try {
      await syncPromise;
    } finally {
      syncInFlight = false;
      if (currentSyncPromise === syncPromise) {
        currentSyncPromise = null;
      }
    }
  }

  void guardedRunSync();

  const intervalId = setInterval(() => {
    void guardedRunSync();
  }, intervalMs);

  return async () => {
    clearInterval(intervalId);
    if (currentSyncPromise) {
      await currentSyncPromise;
    }
  };
}
