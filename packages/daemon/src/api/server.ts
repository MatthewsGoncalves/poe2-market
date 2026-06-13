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
import {
  resolveTradeSearchUrl,
  resolvePreciseTradeUrl,
  TradeRateLimitError,
  buildTradeFallbackUrl,
} from '../sync/tradeLink.js';
import { parseItemText, type ParsedItem } from '../sync/itemParser.js';
import { loadStatIndex, searchStats } from '../sync/statIndex.js';
import { loadTradeItemIndex } from '../sync/tradeItemIndex.js';
import {
  matchItemMods,
  buildPreciseQuery,
  type ModSelection,
  type ExtraStat,
} from '../sync/tradeQueryBuilder.js';

function resolveItemIcon(store: CacheStore, parsed: ParsedItem): string | undefined {
  for (const name of [parsed.name, parsed.baseType]) {
    if (!name) continue;
    const match = store.getByName(name).find((item) => item.icon);
    if (match?.icon) return match.icon;
  }
  return undefined;
}

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

  fastify.get<{
    Querystring: {
      league?: string;
      name?: string;
      gemLevel?: number;
      gemQuality?: number;
      corrupted?: boolean;
      mods?: string | string[];
      maxPrice?: number;
      itemText?: string;
      selections?: string;
      extraStats?: string;
    };
  }>(
    '/api/trade-link',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            league: { type: 'string' },
            name: { type: 'string' },
            gemLevel: { type: 'number' },
            gemQuality: { type: 'number' },
            corrupted: { type: 'boolean' },
            mods: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
            maxPrice: { type: 'number' },
            itemText: { type: 'string' },
            selections: { type: 'string' },
            extraStats: { type: 'string' },
          },
          required: ['league'],
        },
      },
    },
    async (request, reply) => {
      const {
        league,
        name,
        gemLevel,
        gemQuality,
        corrupted,
        mods: modsParam,
        maxPrice,
        itemText,
        selections: selectionsJson,
        extraStats: extraStatsJson,
      } = request.query;

      if (!league) {
        return reply.status(400).send({ error: 'Missing required query parameter: league' });
      }

      const mods = modsParam
        ? (Array.isArray(modsParam) ? modsParam : [modsParam]).filter((m) => m.length > 0)
        : undefined;

      try {
        if (itemText && itemText.trim().length > 0) {
          const [statIndex, itemIndex] = await Promise.all([
            loadStatIndex(),
            loadTradeItemIndex(),
          ]);
          const parsed = parseItemText(itemText);
          parsed.icon = resolveItemIcon(store, parsed);
          const matchedMods = matchItemMods(parsed, statIndex);
          let selections: Record<number, ModSelection> | undefined;
          let extraStats: ExtraStat[] | undefined;
          if (selectionsJson) {
            try {
              selections = JSON.parse(selectionsJson) as Record<number, ModSelection>;
            } catch {
              return reply.status(400).send({ error: 'Invalid selections JSON' });
            }
          }
          if (extraStatsJson) {
            try {
              extraStats = JSON.parse(extraStatsJson) as ExtraStat[];
            } catch {
              return reply.status(400).send({ error: 'Invalid extraStats JSON' });
            }
          }
          const body = buildPreciseQuery(parsed, matchedMods, itemIndex, selections, {
            corrupted,
            extraStats,
          });
          const { url } = await resolvePreciseTradeUrl(league, body);
          return reply.redirect(url, 302);
        }

        if (!name) {
          return reply
            .status(400)
            .send({ error: 'Missing required query parameter: name (or itemText)' });
        }

        const url = await resolveTradeSearchUrl(league, name, {
          gemLevel,
          gemQuality,
          corrupted,
          mods,
          maxPriceChaos: maxPrice,
        });
        return reply.redirect(url, 302);
      } catch (err) {
        if (err instanceof TradeRateLimitError) {
          return reply
            .status(429)
            .header('Retry-After', String(err.retryAfterSeconds))
            .send({ error: err.message, retryAfterSeconds: err.retryAfterSeconds });
        }
        const message = err instanceof Error ? err.message : 'Failed to create trade search';
        return reply.status(502).send({ error: message });
      }
    },
  );

  fastify.post<{
    Body: {
      league?: string;
      itemText?: string;
      selections?: Record<string, ModSelection>;
      corrupted?: boolean;
      extraStats?: ExtraStat[];
    };
  }>(
    '/api/trade-link',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            league: { type: 'string' },
            itemText: { type: 'string' },
            selections: { type: 'object', additionalProperties: true },
            corrupted: { type: 'boolean' },
            extraStats: { type: 'array', items: { type: 'object', additionalProperties: true } },
          },
          required: ['league', 'itemText'],
        },
      },
    },
    async (request, reply) => {
      const { league, itemText, selections, corrupted, extraStats } = request.body ?? {};
      if (!league || !itemText?.trim()) {
        return reply.status(400).send({ error: 'Missing required body fields: league, itemText' });
      }
      try {
        const [statIndex, itemIndex] = await Promise.all([
          loadStatIndex(),
          loadTradeItemIndex(),
        ]);
        const parsed = parseItemText(itemText);
        parsed.icon = resolveItemIcon(store, parsed);
        const matchedMods = matchItemMods(parsed, statIndex);
        const body = buildPreciseQuery(
          parsed,
          matchedMods,
          itemIndex,
          selections as Record<number, ModSelection> | undefined,
          { corrupted, extraStats },
        );
        const { url } = await resolvePreciseTradeUrl(league, body);
        return reply.redirect(url, 302);
      } catch (err) {
        if (err instanceof TradeRateLimitError) {
          return reply
            .status(429)
            .header('Retry-After', String(err.retryAfterSeconds))
            .send({ error: err.message, retryAfterSeconds: err.retryAfterSeconds });
        }
        const message = err instanceof Error ? err.message : 'Failed to create trade search';
        return reply.status(502).send({ error: message });
      }
    },
  );

  fastify.post<{ Body: { itemText?: string } }>(
    '/api/parse-item',
    {
      schema: {
        body: {
          type: 'object',
          properties: { itemText: { type: 'string' } },
          required: ['itemText'],
        },
      },
    },
    async (request, reply) => {
      const itemText = request.body?.itemText;
      if (!itemText || itemText.trim().length === 0) {
        return reply.status(400).send({ error: 'Missing required body field: itemText' });
      }

      const parsed = parseItemText(itemText);
      parsed.icon = resolveItemIcon(store, parsed);
      try {
        const statIndex = await loadStatIndex();
        const matchedMods = matchItemMods(parsed, statIndex);
        return { parsed, matchedMods };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load stat index';
        return reply.status(502).send({ error: message });
      }
    },
  );

  fastify.post<{
    Body: {
      league?: string;
      itemText?: string;
      selections?: Record<string, ModSelection>;
      corrupted?: boolean;
      extraStats?: ExtraStat[];
    };
  }>(
    '/api/trade-search',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            league: { type: 'string' },
            itemText: { type: 'string' },
            selections: { type: 'object', additionalProperties: true },
            corrupted: { type: 'boolean' },
            extraStats: { type: 'array', items: { type: 'object', additionalProperties: true } },
          },
          required: ['league', 'itemText'],
        },
      },
    },
    async (request, reply) => {
      const { league, itemText, selections, corrupted, extraStats } = request.body ?? {};
      if (!league || !itemText || itemText.trim().length === 0) {
        return reply
          .status(400)
          .send({ error: 'Missing required body fields: league, itemText' });
      }

      try {
        const [statIndex, itemIndex] = await Promise.all([
          loadStatIndex(),
          loadTradeItemIndex(),
        ]);
        const parsed = parseItemText(itemText);
        parsed.icon = resolveItemIcon(store, parsed);
        const matchedMods = matchItemMods(parsed, statIndex);
        const body = buildPreciseQuery(
          parsed,
          matchedMods,
          itemIndex,
          selections as Record<number, ModSelection> | undefined,
          { corrupted, extraStats },
        );
        const { url, total } = await resolvePreciseTradeUrl(league, body);
        return { url, total, parsed, matchedMods };
      } catch (err) {
        if (err instanceof TradeRateLimitError) {
          return reply
            .status(429)
            .header('Retry-After', String(err.retryAfterSeconds))
            .send({ error: err.message, retryAfterSeconds: err.retryAfterSeconds });
        }
        const message = err instanceof Error ? err.message : 'Failed to create trade search';
        return reply.status(502).send({ error: message });
      }
    },
  );

  fastify.get<{ Querystring: { q?: string } }>(
    '/api/item-names',
    {
      schema: {
        querystring: { type: 'object', properties: { q: { type: 'string' } } },
      },
    },
    async (request) => {
      const q = (request.query.q ?? '').trim().toLowerCase();
      if (q.length < 2) return { results: [] };

      const found = new Map<string, string | undefined>();
      for (const item of store.getAll()) {
        if (found.size >= 80) break;
        if (item.name.toLowerCase().includes(q) && !found.has(item.name)) {
          found.set(item.name, item.icon);
        }
      }

      try {
        const index = await loadTradeItemIndex();
        for (const name of index.byName.keys()) {
          if (found.size >= 80) break;
          if (name.toLowerCase().includes(q) && !found.has(name)) found.set(name, undefined);
        }
        for (const type of index.byType.keys()) {
          if (found.size >= 80) break;
          if (type.toLowerCase().includes(q) && !found.has(type)) found.set(type, undefined);
        }
      } catch {
        // index unavailable — return whatever the cache matched
      }

      const results = [...found.entries()]
        .map(([name, icon]) => ({ name, icon }))
        .sort((a, b) => {
          const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
          const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
          return a.name.length - b.name.length;
        })
        .slice(0, 20);

      return { results };
    },
  );

  fastify.get<{ Querystring: { q?: string } }>(
    '/api/stats',
    {
      schema: {
        querystring: { type: 'object', properties: { q: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const q = request.query.q ?? '';
      if (q.trim().length < 2) return { results: [] };
      try {
        const index = await loadStatIndex();
        return { results: searchStats(q, index, 20) };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load stat index';
        return reply.status(502).send({ error: message });
      }
    },
  );

  return fastify;
}
