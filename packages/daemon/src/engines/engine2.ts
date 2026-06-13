import type { CacheStore } from '../cache/cacheStore.js';
import type { Config } from '../config.js';
import type { SnipeResult } from '../types.js';

const CURRENCY_NAMES = new Set([
  'Chaos Orb',
  'Divine Orb',
  'Exalted Orb',
  'Mirror of Kalandra',
]);

export function scanSnipes(store: CacheStore, config: Config): SnipeResult[] {
  const { snipeDiscountThreshold, snipeMinValueChaos } = config;

  const results: SnipeResult[] = [];

  for (const item of store.getAll()) {
    if (CURRENCY_NAMES.has(item.name)) continue;
    if (item.lowConfidence) continue;
    if (item.mean < snipeMinValueChaos) continue;
    if (item.min <= 0) continue;
    if (item.min > item.mean * snipeDiscountThreshold) continue;

    const profitChaos = Math.round((item.mean - item.min) * 10) / 10;
    const discountPct = Math.round((1 - item.min / item.mean) * 100);

    results.push({
      name: item.name,
      linkCount: item.linkCount ?? 0,
      meanChaos: item.mean,
      minChaos: item.min,
      profitChaos,
      discountPct,
    });
  }

  results.sort((a, b) => b.profitChaos - a.profitChaos);

  return results;
}
