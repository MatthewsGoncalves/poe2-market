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

    const mods = [...(item.implicits ?? []), ...(item.explicits ?? [])];

    const result: SnipeResult = {
      name: item.name,
      linkCount: item.linkCount ?? 0,
      meanChaos: item.mean,
      minChaos: item.min,
      profitChaos,
      discountPct,
    };
    if (item.icon) result.icon = item.icon;
    if (item.category) result.category = item.category;
    if (item.rarity) result.rarity = item.rarity;
    if (mods.length > 0) result.mods = mods;
    if (item.gemLevel != null) result.gemLevel = item.gemLevel;
    if (item.gemQuality != null) result.gemQuality = item.gemQuality;
    if (item.gemIsCorrupted != null) result.gemIsCorrupted = item.gemIsCorrupted;

    results.push(result);
  }

  results.sort((a, b) => b.profitChaos - a.profitChaos);

  return results;
}
