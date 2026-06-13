import type { ExchangeRates } from '../api';
import type { CurrencyKind } from '../components/CurrencyIcon';

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

export function formatPrice(amount: number): string {
  if (Number.isInteger(amount)) {
    return amount.toLocaleString();
  }
  return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export const CURRENCY_LABELS: Record<CurrencyKind, string> = {
  chaos: 'Chaos',
  divine: 'Divine',
  exalted: 'Exalted',
};
