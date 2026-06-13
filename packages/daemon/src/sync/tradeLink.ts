import { createHash } from 'node:crypto';
import axios, { type AxiosResponse } from 'axios';
import { loadTradeItemIndex, resolveTradeItem, isKnownPoe2TradeItem, type TradeItemMatch } from './tradeItemIndex.js';
import { buildFilteredTradeQuery } from './tradeQueryBuilder.js';
import { loadStatIndex } from './statIndex.js';
import {
  cacheKey,
  getCachedTradeUrl,
  getStaleCachedTradeUrl,
  setCachedTradeUrl,
} from './tradeLinkCache.js';

const TRADE_SEARCH_API = 'https://www.pathofexile.com/api/trade2/search/poe2';
const TRADE_SITE_BASE = 'https://www.pathofexile.com/trade2/search/poe2';
const MIN_API_INTERVAL_MS = 2_000;

export interface TradeSearchOptions {
  gemLevel?: number;
  gemQuality?: number;
  corrupted?: boolean;
  /** Modifier lines to filter by (e.g. from poe.watch or parsed item). */
  mods?: string[];
  /** Max listing price in chaos — narrows to snipe-level listings. */
  maxPriceChaos?: number;
}

export class TradeRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = 'TradeRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

let rateLimitUntil = 0;
let lastApiCallAt = 0;
const inflight = new Map<string, Promise<string>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRateLimitSeconds(data: unknown): number | null {
  if (typeof data !== 'object' || data === null || !('error' in data)) return null;
  const message = (data as { error?: { message?: string } }).error?.message ?? '';
  const match = message.match(/wait (\d+) seconds/i);
  return match ? Number(match[1]) : null;
}

export function getRateLimitRemainingSeconds(): number {
  const remainingMs = rateLimitUntil - Date.now();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

export function resetTradeLinkStateForTests(): void {
  rateLimitUntil = 0;
  lastApiCallAt = 0;
  inflight.clear();
}

function applySearchOptions(
  query: Record<string, unknown>,
  options?: TradeSearchOptions,
): void {
  const filters: Record<string, unknown> = {};
  const miscFilters: Record<string, unknown> = {};

  if (options?.gemLevel != null && options.gemLevel > 0) {
    miscFilters.gem_level = { min: options.gemLevel, max: options.gemLevel };
  }

  if (options?.gemQuality != null && options.gemQuality > 0) {
    miscFilters.gem_quality = { min: options.gemQuality, max: options.gemQuality };
  }

  if (options?.corrupted != null) {
    miscFilters.corrupted = { option: options.corrupted ? 'true' : 'false' };
  }

  if (Object.keys(miscFilters).length > 0) {
    filters.misc_filters = { disabled: false, filters: miscFilters };
  }

  const existingFilters = query.filters as Record<string, unknown> | undefined;
  if (existingFilters || Object.keys(filters).length > 0) {
    query.filters = { ...existingFilters, ...filters };
  }
}

export function buildTradeQuery(itemName: string, match: TradeItemMatch, options?: TradeSearchOptions) {
  const query: Record<string, unknown> = {
    status: { option: 'any' },
    stats: [{ type: 'and', disabled: false, filters: [] }],
  };

  switch (match.kind) {
    case 'unique':
      query.name = match.name;
      break;
    case 'type':
      query.type = match.type;
      query.filters = {
        type_filters: {
          disabled: false,
          filters: {
            category: { option: match.category },
          },
        },
      };
      break;
  }

  applySearchOptions(query, options);

  return {
    query,
    sort: { price: 'asc' },
    engine: 'new',
  };
}

export function encodeTradeLeague(league: string): string {
  return encodeURIComponent(league);
}

export function buildTradeFallbackUrl(league: string): string {
  return `${TRADE_SITE_BASE}/${encodeTradeLeague(league)}`;
}

function tradeRequestHeaders(encodedLeague: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Origin: 'https://www.pathofexile.com',
    Referer: `https://www.pathofexile.com/trade2/search/poe2/${encodedLeague}`,
  };
}

function tradeApiErrorMessage(status: number, data: unknown): string {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const message = (data as { error?: { message?: string } }).error?.message;
    if (message) return message;
  }
  if (status === 403) {
    return 'Trade API blocked the request. Wait a moment and try again.';
  }
  if (status === 429) {
    const seconds = parseRateLimitSeconds(data);
    if (seconds != null) {
      return `Trade API rate limit reached. Wait ${seconds} seconds and try again.`;
    }
    return 'Trade API rate limit reached. Wait a few minutes and try again.';
  }
  return `Trade API error (${status})`;
}

function markRateLimited(data: unknown): void {
  const seconds = parseRateLimitSeconds(data) ?? 120;
  rateLimitUntil = Date.now() + seconds * 1000;
}

async function postTradeSearch(
  encodedLeague: string,
  body: Record<string, unknown>,
): Promise<{ response: AxiosResponse; url: string; total: number | null }> {
  const waitMs = MIN_API_INTERVAL_MS - (Date.now() - lastApiCallAt);
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastApiCallAt = Date.now();

  const response = await axios.post(`${TRADE_SEARCH_API}/${encodedLeague}`, body, {
    headers: tradeRequestHeaders(encodedLeague),
    timeout: 10_000,
    validateStatus: () => true,
  });

  const searchId = response.data?.id;
  const total = typeof response.data?.total === 'number' ? response.data.total : null;
  const url =
    typeof searchId === 'string' && searchId.length > 0
      ? `${TRADE_SITE_BASE}/${encodedLeague}/${searchId}`
      : '';

  return { response, url, total };
}

function assertSearchSuccess(status: number, data: unknown, url: string): void {
  if (status !== 200 || url.length === 0) {
    throw new Error(tradeApiErrorMessage(status, data));
  }
}

async function resolveUncached(
  league: string,
  itemName: string,
  options?: TradeSearchOptions,
): Promise<string> {
  if (Date.now() < rateLimitUntil) {
    const remaining = getRateLimitRemainingSeconds();
    throw new TradeRateLimitError(
      `Trade API rate limit reached. Wait ${remaining} seconds and try again.`,
      remaining,
    );
  }

  const encodedLeague = encodeTradeLeague(league);
  const index = await loadTradeItemIndex();

  if (!isKnownPoe2TradeItem(itemName, index)) {
    throw new Error(`"${itemName}" is not available on the PoE 2 trade site.`);
  }

  const match = resolveTradeItem(itemName, index);
  if (!match) {
    throw new Error(`"${itemName}" is not available on the PoE 2 trade site.`);
  }

  const hasExtraFilters =
    (options?.mods?.length ?? 0) > 0 ||
    (options?.maxPriceChaos != null && options.maxPriceChaos > 0);

  const body = hasExtraFilters
    ? buildFilteredTradeQuery(match, await loadStatIndex(), options)
    : buildTradeQuery(itemName, match, options);
  const result = await postTradeSearch(encodedLeague, body);

  if (result.response.status === 429) {
    markRateLimited(result.response.data);
    throw new TradeRateLimitError(
      tradeApiErrorMessage(result.response.status, result.response.data),
      getRateLimitRemainingSeconds(),
    );
  }

  assertSearchSuccess(result.response.status, result.response.data, result.url);

  if (result.total === 0) {
    throw new Error(`No trade listings found for "${itemName}" in ${league}.`);
  }

  return result.url;
}

function preciseCacheKey(league: string, body: Record<string, unknown>): string {
  const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
  return `v2-precise|${league.trim()}|${hash}`;
}

/**
 * Resolve a trade site URL from a pre-built query body (precise affix search).
 * Unlike {@link resolveTradeSearchUrl} this does not throw on zero results — a
 * precise search may legitimately return nothing and the caller still wants the
 * URL to open on the site.
 */
export async function resolvePreciseTradeUrl(
  league: string,
  body: Record<string, unknown>,
): Promise<{ url: string; total: number | null }> {
  const key = preciseCacheKey(league, body);

  const cached = await getCachedTradeUrl(key);
  if (cached) return { url: cached, total: null };

  if (Date.now() < rateLimitUntil) {
    const stale = await getStaleCachedTradeUrl(key);
    if (stale) return { url: stale, total: null };
    const remaining = getRateLimitRemainingSeconds();
    throw new TradeRateLimitError(
      `Trade API rate limit reached. Wait ${remaining} seconds and try again.`,
      remaining,
    );
  }

  const encodedLeague = encodeTradeLeague(league);
  const result = await postTradeSearch(encodedLeague, body);

  if (result.response.status === 429) {
    markRateLimited(result.response.data);
    const stale = await getStaleCachedTradeUrl(key);
    if (stale) return { url: stale, total: null };
    throw new TradeRateLimitError(
      tradeApiErrorMessage(result.response.status, result.response.data),
      getRateLimitRemainingSeconds(),
    );
  }

  assertSearchSuccess(result.response.status, result.response.data, result.url);
  await setCachedTradeUrl(key, result.url);
  return { url: result.url, total: result.total };
}

export async function resolveTradeSearchUrl(
  league: string,
  itemName: string,
  options?: TradeSearchOptions,
): Promise<string> {
  const key = cacheKey(league, itemName, options);

  const cached = await getCachedTradeUrl(key);
  if (cached) return cached;

  if (Date.now() < rateLimitUntil) {
    const stale = await getStaleCachedTradeUrl(key);
    if (stale) return stale;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const url = await resolveUncached(league, itemName, options);
      await setCachedTradeUrl(key, url);
      return url;
    } catch (err) {
      if (err instanceof TradeRateLimitError) {
        const stale = await getStaleCachedTradeUrl(key);
        if (stale) return stale;
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}
