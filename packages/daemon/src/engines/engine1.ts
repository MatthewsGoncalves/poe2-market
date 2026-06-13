import type { CacheStore } from '../cache/cacheStore.js';
import type { ExchangeRates, ItemEvaluation } from '../types.js';

export interface ItemProperties {
  linkCount?: number;
  gemLevel?: number;
  gemQuality?: number;
  gemIsCorrupted?: boolean;
}

type NotFoundResult = { found: false; name: string };

export function evaluate(
  name: string,
  props: Partial<ItemProperties>,
  store: CacheStore,
  rates: ExchangeRates,
): ItemEvaluation | NotFoundResult {
  const candidates = store.getByName(name);

  const filtered = candidates.filter((item) => {
    if (props.linkCount !== undefined && item.linkCount !== props.linkCount) return false;
    if (props.gemLevel !== undefined && item.gemLevel !== props.gemLevel) return false;
    if (props.gemQuality !== undefined && item.gemQuality !== props.gemQuality) return false;
    if (props.gemIsCorrupted === true && item.gemIsCorrupted !== true) return false;
    if (props.gemIsCorrupted === false && item.gemIsCorrupted === true) return false;
    return true;
  });

  if (filtered.length === 0) {
    return { found: false, name };
  }

  const item = filtered.reduce((best, curr) => (curr.mean > best.mean ? curr : best));

  return {
    name,
    found: true,
    meanChaos: item.mean,
    minChaos: item.min,
    meanDivine: Math.round((item.mean / rates.divineInChaos) * 100) / 100,
    suggestedListPrice: item.mean,
    lowConfidence: item.lowConfidence,
  };
}
