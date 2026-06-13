import type { TradeSearchOptions } from './tradeSearchOptions';
import type { ExtraStat, ModSelection } from '../api';

function daemonBaseUrl(): string {
  return import.meta.env.VITE_DAEMON_URL ?? 'http://localhost:3001';
}

export function buildTradeSearchUrl(
  league: string,
  itemName: string,
  options?: TradeSearchOptions,
): string {
  const url = new URL(`${daemonBaseUrl()}/api/trade-link`);
  url.searchParams.set('league', league);
  url.searchParams.set('name', itemName);
  if (options?.gemLevel != null) url.searchParams.set('gemLevel', String(options.gemLevel));
  if (options?.gemQuality != null) url.searchParams.set('gemQuality', String(options.gemQuality));
  if (options?.corrupted != null) url.searchParams.set('corrupted', String(options.corrupted));
  if (options?.maxPriceChaos != null) {
    url.searchParams.set('maxPrice', String(options.maxPriceChaos));
  }
  for (const mod of options?.mods ?? []) {
    url.searchParams.append('mods', mod);
  }
  return url.toString();
}

/** Build a redirect URL that carries the full parsed item + mod filters to the trade site. */
export function buildPreciseTradeLinkUrl(
  league: string,
  itemText: string,
  selections?: Record<number, ModSelection>,
  extraStats?: ExtraStat[],
  corrupted?: boolean,
): string {
  const url = new URL(`${daemonBaseUrl()}/api/trade-link`);
  url.searchParams.set('league', league);
  url.searchParams.set('itemText', itemText);
  if (selections && Object.keys(selections).length > 0) {
    url.searchParams.set('selections', JSON.stringify(selections));
  }
  if (extraStats && extraStats.length > 0) {
    url.searchParams.set('extraStats', JSON.stringify(extraStats));
  }
  if (corrupted != null) url.searchParams.set('corrupted', String(corrupted));
  return url.toString();
}

export type { TradeSearchOptions };
