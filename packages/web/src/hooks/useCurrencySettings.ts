import type { CurrencyKind } from '../components/CurrencyIcon';

export type DisplayCurrency = CurrencyKind;

export interface CurrencySettings {
  displayCurrency: DisplayCurrency;
  expectedCurrency: CurrencyKind;
  mistakenCurrency: CurrencyKind;
  minSnipeProfit: number;
}

const STORAGE_KEY = 'poe2-market-currency-settings';

const DEFAULTS: CurrencySettings = {
  displayCurrency: 'divine',
  expectedCurrency: 'divine',
  mistakenCurrency: 'exalted',
  minSnipeProfit: 0,
};

function loadSettings(): CurrencySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<CurrencySettings>;
    return {
      displayCurrency: parsed.displayCurrency ?? DEFAULTS.displayCurrency,
      expectedCurrency: parsed.expectedCurrency ?? DEFAULTS.expectedCurrency,
      mistakenCurrency: parsed.mistakenCurrency ?? DEFAULTS.mistakenCurrency,
      minSnipeProfit: parsed.minSnipeProfit ?? DEFAULTS.minSnipeProfit,
    };
  } catch {
    return DEFAULTS;
  }
}

export function readCurrencySettings(): CurrencySettings {
  return loadSettings();
}

export function saveCurrencySettings(settings: CurrencySettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export { DEFAULTS as DEFAULT_CURRENCY_SETTINGS };
