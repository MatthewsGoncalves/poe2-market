import type { ExchangeRates, CurrencyKind } from './types.js';

export function rateInChaos(kind: CurrencyKind, rates: ExchangeRates): number {
  switch (kind) {
    case 'chaos':
      return 1;
    case 'divine':
      return rates.divineInChaos;
    case 'exalted':
      return rates.exaltedInChaos;
  }
}

export function fromChaos(chaos: number, kind: CurrencyKind, rates: ExchangeRates): number {
  return Math.round((chaos / rateInChaos(kind, rates)) * 100) / 100;
}

export function toChaos(amount: number, kind: CurrencyKind, rates: ExchangeRates): number {
  return amount * rateInChaos(kind, rates);
}

export function parseCurrencyKind(value: string | undefined, fallback: CurrencyKind): CurrencyKind {
  if (value === 'chaos' || value === 'divine' || value === 'exalted') {
    return value;
  }
  return fallback;
}
