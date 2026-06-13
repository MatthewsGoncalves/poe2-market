import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchStatus,
  fetchSnipes,
  fetchCurrencyErrors,
  evaluateItem,
  checkHealth,
  ApiError,
} from '../api';

// Mock globalThis.fetch
const mockFetch = vi.fn();

function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function makeErrorResponse(status: number, body = 'Internal Server Error'): Response {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: () => Promise.reject(new Error('not ok')),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(() => {
  globalThis.fetch = mockFetch;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fetchStatus', () => {
  it('calls GET <VITE_DAEMON_URL>/api/status and returns a typed status object', async () => {
    const body = {
      league: 'Return of the Ancients',
      lastSyncAt: '2026-06-09T14:32:00.000Z',
      itemCount: 42310,
      rates: { divineInChaos: 160, exaltedInChaos: 10 },
      stale: false,
    };
    mockFetch.mockResolvedValueOnce(makeOkResponse(body));

    const result = await fetchStatus();

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/status');
    expect(result).toEqual(body);
  });

  it('throws ApiError with status 500 when the daemon returns 500', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500, 'Internal Server Error'));

    await expect(fetchStatus()).rejects.toSatisfy((err: unknown) => {
      return err instanceof ApiError && err.status === 500;
    });
  });
});

describe('fetchSnipes', () => {
  it('calls GET /api/snipes with no params when called without arguments', async () => {
    const body = { results: [], generatedAt: '2026-06-09T14:32:01.000Z' };
    mockFetch.mockResolvedValueOnce(makeOkResponse(body));

    await fetchSnipes();

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/snipes');
  });

  it('calls GET /api/snipes?minProfit=100 when minProfit is 100', async () => {
    const body = { results: [], generatedAt: '2026-06-09T14:32:01.000Z' };
    mockFetch.mockResolvedValueOnce(makeOkResponse(body));

    await fetchSnipes({ minProfit: 100 });

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/snipes?minProfit=100');
  });

  it('calls GET /api/snipes?maxResults=10 when maxResults is 10', async () => {
    const body = { results: [], generatedAt: '2026-06-09T14:32:01.000Z' };
    mockFetch.mockResolvedValueOnce(makeOkResponse(body));

    await fetchSnipes({ maxResults: 10 });

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/snipes?maxResults=10');
  });

  it('includes both params when both are provided', async () => {
    const body = { results: [], generatedAt: '2026-06-09T14:32:01.000Z' };
    mockFetch.mockResolvedValueOnce(makeOkResponse(body));

    await fetchSnipes({ minProfit: 50, maxResults: 20 });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/snipes?minProfit=50&maxResults=20',
    );
  });
  it('includes currency param when provided', async () => {
    const body = { results: [], generatedAt: '2026-06-09T14:32:01.000Z' };
    mockFetch.mockResolvedValueOnce(makeOkResponse(body));

    await fetchSnipes({ minProfit: 5, currency: 'divine' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/snipes?minProfit=5&currency=divine',
    );
  });
});

describe('fetchCurrencyErrors', () => {
  it('calls GET /api/currency-errors and returns alerts', async () => {
    const body = {
      alerts: [
        {
          name: 'Headhunter',
          expectedAmount: 12.5,
          expectedCurrency: 'divine',
          listedMinChaos: 125,
          listedAsAmount: 12.5,
          mistakenCurrency: 'exalted',
        },
      ],
      generatedAt: '2026-06-09T14:32:01.000Z',
    };
    mockFetch.mockResolvedValueOnce(makeOkResponse(body));

    const result = await fetchCurrencyErrors();

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/currency-errors');
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].name).toBe('Headhunter');
  });

  it('includes expected and mistaken params when provided', async () => {
    const body = { alerts: [], generatedAt: '2026-06-09T14:32:01.000Z' };
    mockFetch.mockResolvedValueOnce(makeOkResponse(body));

    await fetchCurrencyErrors({ expected: 'divine', mistaken: 'chaos' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/currency-errors?expected=divine&mistaken=chaos',
    );
  });
});

describe('evaluateItem', () => {
  it('calls GET /api/evaluate?name=Headhunter&linkCount=6 with name and linkCount', async () => {
    const body = {
      found: true,
      name: 'Headhunter',
      meanChaos: 2000,
      minChaos: 1800,
      meanDivine: 12.5,
      suggestedListPrice: 2000,
      lowConfidence: false,
    };
    mockFetch.mockResolvedValueOnce(makeOkResponse(body));

    await evaluateItem({ name: 'Headhunter', linkCount: 6 });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/evaluate?name=Headhunter&linkCount=6',
    );
  });

  it('only includes name when no optional params are provided', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ found: false, name: 'Unknown Item' }),
    );

    await evaluateItem({ name: 'Unknown Item' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/evaluate?name=Unknown+Item',
    );
  });

  it('includes all optional params when provided', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse({ found: false, name: 'Gem' }));

    await evaluateItem({ name: 'Gem', gemLevel: 20, gemQuality: 23, corrupted: true });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/evaluate?name=Gem&gemLevel=20&gemQuality=23&corrupted=true',
    );
  });
});

describe('checkHealth', () => {
  it('returns { ok: true } on a mocked 200 response', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse({ ok: true }));

    const result = await checkHealth();

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/health');
    expect(result).toEqual({ ok: true });
  });
});

describe('ApiError', () => {
  it('is thrown with correct status and message on non-2xx responses', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(404, 'Not Found'));

    try {
      await fetchStatus();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(404);
      expect((err as ApiError).message).toBe('Not Found');
    }
  });

  it('is ApiError (subclass of Error) not a plain Error', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(503, 'Service Unavailable'));

    const err = await checkHealth().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect((err as ApiError).name).toBe('ApiError');
  });
});

describe('VITE_DAEMON_URL env var', () => {
  it('overrides the default http://localhost:3001', async () => {
    vi.stubEnv('VITE_DAEMON_URL', 'http://custom-daemon:9999');
    mockFetch.mockResolvedValueOnce(makeOkResponse({ ok: true }));

    await checkHealth();

    expect(mockFetch).toHaveBeenCalledWith('http://custom-daemon:9999/api/health');
  });
});
