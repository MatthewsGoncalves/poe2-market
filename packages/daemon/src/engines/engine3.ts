import type { CacheStore } from '../cache/cacheStore.js';
import type { Config } from '../config.js';
import type { ExchangeRates, CurrencyErrorResult, CurrencyKind } from '../types.js';
import { fromChaos, rateInChaos } from '../currency.js';

export interface CurrencyErrorOptions {
  expectedCurrency?: CurrencyKind;
  mistakenCurrency?: CurrencyKind;
}

const DEFAULT_EXPECTED: CurrencyKind = 'divine';
const DEFAULT_MISTAKEN: CurrencyKind = 'exalted';

export function detectCurrencyErrors(
  store: CacheStore,
  rates: ExchangeRates,
  config: Config,
  options: CurrencyErrorOptions = {},
): CurrencyErrorResult[] {
  const expectedCurrency = options.expectedCurrency ?? DEFAULT_EXPECTED;
  let mistakenCurrency = options.mistakenCurrency ?? DEFAULT_MISTAKEN;
  if (expectedCurrency === mistakenCurrency) {
    mistakenCurrency = DEFAULT_MISTAKEN;
  }

  const { currencyErrorMinDivines, currencyErrorTolerancePct } = config;
  const minMeanThreshold = currencyErrorMinDivines * rates.divineInChaos;

  const results: CurrencyErrorResult[] = [];

  for (const item of store.getAll()) {
    if (item.lowConfidence) continue;
    if (item.min <= 0) continue;
    if (item.mean <= minMeanThreshold) continue;

    const expectedAmount = fromChaos(item.mean, expectedCurrency, rates);
    const mistakenPriceInChaos = expectedAmount * rateInChaos(mistakenCurrency, rates);
    const lower = mistakenPriceInChaos * (1 - currencyErrorTolerancePct);
    const upper = mistakenPriceInChaos * (1 + currencyErrorTolerancePct);

    if (item.min < lower || item.min > upper) continue;

    results.push({
      name: item.name,
      expectedAmount,
      expectedCurrency,
      listedMinChaos: item.min,
      listedAsAmount: fromChaos(item.min, mistakenCurrency, rates),
      mistakenCurrency,
    });
  }

  return results;
}
