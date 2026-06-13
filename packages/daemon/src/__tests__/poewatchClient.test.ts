import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    isAxiosError: (err: unknown): boolean =>
      typeof err === 'object' &&
      err !== null &&
      (err as { isAxiosError?: unknown }).isAxiosError === true,
  },
}));

import axios from 'axios';
import { fetchCompact, fetchRates, PoeWatchApiError } from '../sync/poewatchClient.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compactFixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/compact.json'), 'utf-8'),
) as unknown[];
const exchangeFixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/exchange.json'), 'utf-8'),
) as { items: { name: string; mean: number }[] };

const mockedGet = vi.mocked(axios.get);

function makeAxiosError(
  status: number,
  data: unknown,
): { isAxiosError: true; response: { status: number; data: unknown } } {
  return { isAxiosError: true, response: { status, data } };
}

beforeEach(() => {
  mockedGet.mockReset();
});

describe('fetchCompact', () => {
  it('constructs URL with correct league and game query params', async () => {
    mockedGet.mockResolvedValueOnce({ data: [] });
    await fetchCompact('TestLeague', 'poe2');
    expect(mockedGet).toHaveBeenCalledWith(
      'https://api.poe.watch/compact',
      expect.objectContaining({
        params: { league: 'TestLeague', game: 'poe2' },
        timeout: 30_000,
      }),
    );
  });

  it('uses custom baseUrl when provided', async () => {
    mockedGet.mockResolvedValueOnce({ data: [] });
    await fetchCompact('TestLeague', 'poe2', 'https://custom.poe.watch');
    expect(mockedGet).toHaveBeenCalledWith(
      'https://custom.poe.watch/compact',
      expect.anything(),
    );
  });

  it('returns a MarketItem array matching the fixture shape', async () => {
    mockedGet.mockResolvedValueOnce({ data: compactFixture });
    const items = await fetchCompact('TestLeague', 'poe2');

    const headhunter = items.find((i) => i.name === 'Headhunter');
    expect(headhunter).toBeDefined();
    expect(headhunter?.mean).toBe(800.5);
    expect(headhunter?.min).toBe(650.0);
    expect(headhunter?.lowConfidence).toBe(false);
    expect(headhunter?.linkCount).toBeUndefined();
    expect(headhunter?.gemLevel).toBeUndefined();

    const gem = items.find((i) => i.name === 'Devouring Totem Support' && i.gemLevel === 20);
    expect(gem).toBeDefined();
    expect(gem?.gemLevel).toBe(20);
    expect(gem?.gemQuality).toBe(20);
    expect(gem?.gemIsCorrupted).toBe(false);

    const sixLink = items.find((i) => i.name === "Shavronne's Wrappings");
    expect(sixLink).toBeDefined();
    expect(sixLink?.linkCount).toBe(6);

    const lowConf = items.find((i) => i.lowConfidence === true);
    expect(lowConf).toBeDefined();
    expect(lowConf?.name).toBe('Rare Synthesised Jewel');
  });

  it('accepts compact payload wrapped in { items: [...] }', async () => {
    mockedGet.mockResolvedValueOnce({ data: { items: compactFixture } });
    const items = await fetchCompact('TestLeague', 'poe2');
    expect(items).toHaveLength(compactFixture.length);
    expect(items.find((i) => i.name === 'Headhunter')?.mean).toBe(800.5);
  });

  it('maps linkCount and gemIsCorrupted field names from live API', async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        items: [
          {
            name: 'Seven Teachings',
            mean: 756,
            min: 756,
            linkCount: 5,
            lowConfidence: true,
          },
          {
            name: 'Shield Crush',
            mean: 370,
            min: 370,
            gemLevel: 21,
            gemQuality: 23,
            gemIsCorrupted: true,
            lowConfidence: true,
          },
        ],
      },
    });
    const items = await fetchCompact('Mirage', 'poe2');
    expect(items[0]?.linkCount).toBe(5);
    expect(items[1]?.gemIsCorrupted).toBe(true);
  });

  it('maps links field to linkCount only when > 0', async () => {
    mockedGet.mockResolvedValueOnce({ data: compactFixture });
    const items = await fetchCompact('TestLeague', 'poe2');
    const noLinks = items.find((i) => i.name === 'Headhunter');
    expect(noLinks?.linkCount).toBeUndefined();
  });

  it('maps corrupted field to gemIsCorrupted', async () => {
    mockedGet.mockResolvedValueOnce({ data: compactFixture });
    const items = await fetchCompact('TestLeague', 'poe2');
    const corruptedGem = items.find(
      (i) => i.name === 'Devouring Totem Support' && i.gemLevel === 21,
    );
    expect(corruptedGem?.gemIsCorrupted).toBe(true);
  });

  it('throws PoeWatchApiError with status code when API returns 500', async () => {
    mockedGet.mockRejectedValueOnce(makeAxiosError(500, 'Internal Server Error'));
    const err = await fetchCompact('TestLeague', 'poe2').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PoeWatchApiError);
    expect(err).toMatchObject({ statusCode: 500, responseBody: 'Internal Server Error' });
  });

  it('throws PoeWatchApiError with JSON-stringified body when response data is an object', async () => {
    mockedGet.mockRejectedValueOnce(makeAxiosError(404, { message: 'Not Found' }));
    const err = await fetchCompact('TestLeague', 'poe2').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PoeWatchApiError);
    expect(err).toMatchObject({ statusCode: 404, responseBody: '{"message":"Not Found"}' });
  });

  it('propagates network error when axios rejects without a response', async () => {
    const networkError = new Error('connect ECONNREFUSED 127.0.0.1:80');
    mockedGet.mockRejectedValueOnce(networkError);
    await expect(fetchCompact('TestLeague', 'poe2')).rejects.toThrow(
      'connect ECONNREFUSED 127.0.0.1:80',
    );
  });

  it('propagates axios timeout rejection (ECONNABORTED)', async () => {
    const timeoutError = Object.assign(new Error('timeout of 30000ms exceeded'), {
      code: 'ECONNABORTED',
    });
    mockedGet.mockRejectedValueOnce(timeoutError);
    await expect(fetchCompact('TestLeague', 'poe2')).rejects.toThrow(
      'timeout of 30000ms exceeded',
    );
  });
});

describe('fetchRates', () => {
  it('constructs URL with correct league and game query params', async () => {
    mockedGet.mockResolvedValueOnce({ data: exchangeFixture });
    await fetchRates('TestLeague', 'poe2');
    expect(mockedGet).toHaveBeenCalledWith(
      'https://api.poe.watch/exchange/ratios',
      expect.objectContaining({
        params: { league: 'TestLeague', game: 'poe2' },
        timeout: 30_000,
      }),
    );
  });

  it('extracts divineInChaos and exaltedInChaos from items array by name', async () => {
    mockedGet.mockResolvedValueOnce({ data: exchangeFixture });
    const rates = await fetchRates('TestLeague', 'poe2');
    expect(rates.divineInChaos).toBe(160.0);
    expect(rates.exaltedInChaos).toBe(10.5);
  });

  it('throws PoeWatchApiError when Divine Orb is absent', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { items: [{ name: 'Exalted Orb', mean: 10.5 }] },
    });
    const err = await fetchRates('TestLeague', 'poe2').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PoeWatchApiError);
    expect(err).toMatchObject({
      statusCode: 200,
      responseBody: 'Missing exchange rate(s): Divine Orb',
    });
  });

  it('throws PoeWatchApiError when Exalted Orb is absent', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { items: [{ name: 'Divine Orb', mean: 155.0 }] },
    });
    const err = await fetchRates('TestLeague', 'poe2').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PoeWatchApiError);
    expect(err).toMatchObject({
      statusCode: 200,
      responseBody: 'Missing exchange rate(s): Exalted Orb',
    });
  });

  it('throws PoeWatchApiError when items array is empty', async () => {
    mockedGet.mockResolvedValueOnce({ data: { items: [] } });
    const err = await fetchRates('TestLeague', 'poe2').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PoeWatchApiError);
    expect(err).toMatchObject({
      statusCode: 200,
      responseBody: 'Missing exchange rate(s): Divine Orb, Exalted Orb',
    });
  });

  it('throws PoeWatchApiError when API returns non-2xx', async () => {
    mockedGet.mockRejectedValueOnce(makeAxiosError(503, 'Service Unavailable'));
    const err = await fetchRates('TestLeague', 'poe2').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PoeWatchApiError);
    expect(err).toMatchObject({ statusCode: 503, responseBody: 'Service Unavailable' });
  });

  it('propagates network error when axios rejects without a response', async () => {
    const networkError = new Error('getaddrinfo ENOTFOUND api.poe.watch');
    mockedGet.mockRejectedValueOnce(networkError);
    await expect(fetchRates('TestLeague', 'poe2')).rejects.toThrow(
      'getaddrinfo ENOTFOUND api.poe.watch',
    );
  });
});

const RUN_LIVE = process.env['RUN_LIVE_TESTS'] === 'true';

describe.skipIf(!RUN_LIVE)('live integration (RUN_LIVE_TESTS=true)', () => {
  it(
    'fetchCompact returns an array with at least 1000 items with non-empty name and numeric mean',
    async () => {
      const items = await fetchCompact('Return of the Ancients', 'poe2');
      expect(items.length).toBeGreaterThanOrEqual(1000);
      for (const item of items.slice(0, 10)) {
        expect(typeof item.name).toBe('string');
        expect(item.name.length).toBeGreaterThan(0);
        expect(typeof item.mean).toBe('number');
        expect(typeof item.min).toBe('number');
      }
    },
    30000,
  );

  it(
    'fetchRates returns divineInChaos > 0 and exaltedInChaos > 0',
    async () => {
      const rates = await fetchRates('Return of the Ancients', 'poe2');
      expect(rates.divineInChaos).toBeGreaterThan(0);
      expect(rates.exaltedInChaos).toBeGreaterThan(0);
    },
    30000,
  );
});
