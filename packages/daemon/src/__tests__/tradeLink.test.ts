import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  buildTradeQuery,
  encodeTradeLeague,
  resolveTradeSearchUrl,
  resetTradeLinkStateForTests,
  TradeRateLimitError,
} from '../sync/tradeLink.js';
import { seedTradeItemIndexForTests, resetTradeItemIndexForTests } from '../sync/tradeItemIndex.js';
import {
  resetTradeLinkCacheForTests,
  seedTradeLinkCacheForTests,
  cacheKey,
} from '../sync/tradeLinkCache.js';

vi.mock('axios', () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));

describe('tradeLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTradeItemIndexForTests();
    resetTradeLinkCacheForTests();
    resetTradeLinkStateForTests();
    seedTradeItemIndexForTests({
      loadedAt: Date.now(),
      byName: new Map([['Headhunter', { kind: 'unique', name: 'Headhunter' }]]),
      byType: new Map([
        ['Divine Orb', { kind: 'type', category: 'currency', type: 'Divine Orb' }],
        ['Fork', { kind: 'type', category: 'gem', type: 'Fork' }],
      ]),
    });
  });

  it('encodes league names for trade URLs', () => {
    expect(encodeTradeLeague('Runes of Aldur')).toBe('Runes%20of%20Aldur');
  });

  it('builds a currency query using type filters', () => {
    const body = buildTradeQuery('Divine Orb', {
      kind: 'type',
      category: 'currency',
      type: 'Divine Orb',
    });
    expect(body.query.status).toEqual({ option: 'any' });
    expect(body.query.type).toEqual('Divine Orb');
    expect(body.query.filters).toEqual({
      type_filters: {
        disabled: false,
        filters: {
          category: { option: 'currency' },
        },
      },
    });
    expect(body.engine).toBe('new');
    expect(body.query.name).toBeUndefined();
  });

  it('resolves a trade site URL with search id from the API', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      status: 200,
      data: { id: 'L6XwDWBSn', total: 10 },
    });

    const url = await resolveTradeSearchUrl('Runes of Aldur', 'Headhunter');

    expect(url).toBe(
      'https://www.pathofexile.com/trade2/search/poe2/Runes%20of%20Aldur/L6XwDWBSn',
    );
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('rejects items that are not on the PoE 2 trade site', async () => {
    await expect(resolveTradeSearchUrl('Runes of Aldur', 'Devouring Totem')).rejects.toThrow(
      'not available on the PoE 2 trade site',
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('throws when the trade API finds zero listings', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      status: 200,
      data: { id: 'emptySearch', total: 0 },
    });

    await expect(resolveTradeSearchUrl('Runes of Aldur', 'Headhunter')).rejects.toThrow(
      'No trade listings found',
    );
  });

  it('throws when the trade API returns an error', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      status: 400,
      data: { error: { message: 'Invalid query' } },
    });

    await expect(resolveTradeSearchUrl('Mirage', 'Headhunter')).rejects.toThrow('Invalid query');
  });

  it('returns a cached trade URL without calling the API again', async () => {
    const key = cacheKey('Runes of Aldur', 'Headhunter');
    seedTradeLinkCacheForTests(
      key,
      'https://www.pathofexile.com/trade2/search/poe2/Runes%20of%20Aldur/cachedId',
    );

    const url = await resolveTradeSearchUrl('Runes of Aldur', 'Headhunter');

    expect(url).toContain('/cachedId');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('serves a stale cached URL when rate limited', async () => {
    const key = cacheKey('Runes of Aldur', 'Headhunter');
    seedTradeLinkCacheForTests(
      key,
      'https://www.pathofexile.com/trade2/search/poe2/Runes%20of%20Aldur/staleId',
      Date.now() - 48 * 60 * 60 * 1000,
    );

    vi.mocked(axios.post).mockResolvedValue({
      status: 429,
      data: { error: { message: 'Rate limit exceeded; Please wait 133 seconds before trying again.' } },
    });

    const url = await resolveTradeSearchUrl('Runes of Aldur', 'Headhunter');

    expect(url).toContain('/staleId');
  });

  it('throws TradeRateLimitError when rate limited without cache', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      status: 429,
      data: { error: { message: 'Rate limit exceeded; Please wait 133 seconds before trying again.' } },
    });

    await expect(resolveTradeSearchUrl('Runes of Aldur', 'Headhunter')).rejects.toBeInstanceOf(
      TradeRateLimitError,
    );
  });

  it('reports a clearer message when Cloudflare blocks the request', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      status: 403,
      data: '<!DOCTYPE html>',
    });

    await expect(resolveTradeSearchUrl('Runes of Aldur', 'Headhunter')).rejects.toThrow(
      'Trade API blocked the request',
    );
  });
});
