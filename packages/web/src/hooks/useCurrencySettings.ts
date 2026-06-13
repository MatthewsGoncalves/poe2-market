import type { CurrencyKind } from '../components/CurrencyIcon';

export type DisplayCurrency = CurrencyKind;

export interface CurrencySettings {
  displayCurrency: DisplayCurrency;
  expectedCurrency: CurrencyKind;
  mistakenCurrency: CurrencyKind;
  /** Minimum snipe profit stored in chaos — display converts for UI only. */
  minSnipeProfitChaos: number;
}

const STORAGE_KEY = 'poe2-market-currency-settings';

const DEFAULTS: CurrencySettings = {
  displayCurrency: 'divine',
  expectedCurrency: 'divine',
  mistakenCurrency: 'exalted',
  minSnipeProfitChaos: 0,
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
      minSnipeProfitChaos:
        parsed.minSnipeProfitChaos ??
        (parsed as { minSnipeProfit?: number }).minSnipeProfit ??
        DEFAULTS.minSnipeProfitChaos,
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
