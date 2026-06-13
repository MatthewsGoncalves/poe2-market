import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CacheStore } from '../cache/cacheStore.js';
import type { Config } from '../config.js';
import { fromChaos, parseCurrencyKind, toChaos } from '../currency.js';
import { evaluate } from '../engines/engine1.js';
import { scanSnipes } from '../engines/engine2.js';
import { detectCurrencyErrors } from '../engines/engine3.js';

const WEB_DIST = join(dirname(fileURLToPath(import.meta.url)), '../../../web/dist');

export function buildServer(store: CacheStore, config: Config) {
  const fastify = Fastify({ logger: false });

  fastify.addHook('onResponse', (request, reply, done) => {
    if (request.url.startsWith('/api/')) {
      console.info('[INFO] API request received', {
        method: request.method,
        path: request.url.split('?')[0] ?? request.url,
        durationMs: Math.round(reply.elapsedTime),
      });
    }
    done();
  });

  if (process.env['NODE_ENV'] !== 'production') {
    fastify.register(cors, { origin: 'http://localhost:5173' });
  } else {
    fastify.register(staticPlugin, { root: WEB_DIST, prefix: '/' });
  }

  fastify.get('/api/health', async () => {
    return { ok: true };
  });

  fastify.get('/api/status', async () => {
    const state = store.getState();
    const lastSyncMs = state.lastSyncAt ? new Date(state.lastSyncAt).getTime() : 0;
    const stale = lastSyncMs === 0 || Date.now() - lastSyncMs > config.syncIntervalMs * 2;
    return {
      league: state.league,
      expansionName: config.expansionName,
      lastSyncAt: state.lastSyncAt,
      itemCount: state.items.length,
      rates: state.rates,
      stale,
    };
  });

  fastify.get<{
    Querystring: { minProfit?: number; maxResults?: number; currency?: string };
  }>(
    '/api/snipes',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            minProfit: { type: 'number', default: 0 },
            maxResults: { type: 'number', default: 50 },
            currency: { type: 'string', enum: ['chaos', 'divine', 'exalted'], default: 'chaos' },
          },
        },
      },
    },
    async (request) => {
      const { minProfit = 0, maxResults = 50, currency: currencyParam } = request.query;
      const state = store.getState();
      const currency = parseCurrencyKind(currencyParam, 'chaos');
      const minProfitChaos =
        currency === 'chaos' ? minProfit : toChaos(minProfit, currency, state.rates);
      const all = scanSnipes(store, config);
      const filtered = all.filter((r) => r.profitChaos >= minProfitChaos).slice(0, maxResults);
      console.info('[INFO] Engine 2 scan result', {
        opportunityCount: filtered.length,
        topProfit: filtered[0]?.profitChaos ?? 0,
      });
      return { results: filtered, generatedAt: new Date().toISOString() };
    },
  );

  fastify.get<{
    Querystring: {
      name?: string;
      linkCount?: number;
      gemLevel?: number;
      gemQuality?: number;
      corrupted?: boolean;
    };
  }>(
    '/api/evaluate',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            linkCount: { type: 'number' },
            gemLevel: { type: 'number' },
            gemQuality: { type: 'number' },
            corrupted: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { name, linkCount, gemLevel, gemQuality, corrupted } = request.query;
      if (!name) {
        return reply.status(400).send({ error: 'Missing required query parameter: name' });
      }
      const state = store.getState();
      const result = evaluate(
        name,
        { linkCount, gemLevel, gemQuality, gemIsCorrupted: corrupted },
        store,
        state.rates,
      );
      return result;
    },
  );

  fastify.get<{
    Querystring: { expected?: string; mistaken?: string };
  }>(
    '/api/currency-errors',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            expected: { type: 'string', enum: ['chaos', 'divine', 'exalted'], default: 'divine' },
            mistaken: { type: 'string', enum: ['chaos', 'divine', 'exalted'], default: 'exalted' },
          },
        },
      },
    },
    async (request) => {
      const state = store.getState();
      const expected = parseCurrencyKind(request.query.expected, 'divine');
      const mistaken = parseCurrencyKind(request.query.mistaken, 'exalted');
      const alerts = detectCurrencyErrors(store, state.rates, config, {
        expectedCurrency: expected,
        mistakenCurrency: mistaken,
      });
      for (const alert of alerts) {
        console.warn('[WARN] Engine 3 alert found', {
          itemName: alert.name,
          listedMinChaos: alert.listedMinChaos,
          expectedAmount: alert.expectedAmount,
          expectedCurrency: alert.expectedCurrency,
          listedAsAmount: alert.listedAsAmount,
          mistakenCurrency: alert.mistakenCurrency,
        });
      }
      return { alerts, generatedAt: new Date().toISOString() };
    },
  );

  return fastify;
}
