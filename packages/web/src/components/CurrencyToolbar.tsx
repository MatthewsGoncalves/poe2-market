import type { CurrencyKind } from './CurrencyIcon';
import { CurrencyIcon } from './CurrencyIcon';
import { CURRENCY_LABELS, fromChaos, toChaos } from '../utils/currency';
import type { CurrencySettings } from '../hooks/useCurrencySettings';
import type { ExchangeRates } from '../api';

export type CurrencyToolbarVariant = 'snipes' | 'mistakes' | 'evaluator';

interface Props {
  settings: CurrencySettings;
  onChange: (settings: CurrencySettings) => void;
  variant: CurrencyToolbarVariant;
  rates: ExchangeRates;
}

const CURRENCY_OPTIONS: CurrencyKind[] = ['chaos', 'divine', 'exalted'];

export function CurrencyToolbar({ settings, onChange, variant, rates }: Props) {
  const update = (patch: Partial<CurrencySettings>) => {
    onChange({ ...settings, ...patch });
  };

  const mistakeInvalid = settings.expectedCurrency === settings.mistakenCurrency;
  const displayId = `display-currency-${variant}`;

  return (
    <div className="currency-toolbar" role="region" aria-label="Currency settings">
      <div className="currency-toolbar-group">
        <label className="field-label" htmlFor={displayId}>
          Exibir preços em
        </label>
        <select
          id={displayId}
          value={settings.displayCurrency}
          onChange={(e) => update({ displayCurrency: e.target.value as CurrencyKind })}
        >
          {CURRENCY_OPTIONS.map((kind) => (
            <option key={kind} value={kind}>
              {CURRENCY_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>

      {variant === 'mistakes' && (
        <>
          <div className="currency-toolbar-group">
            <label className="field-label" htmlFor={`expected-currency-${variant}`}>
              Valor esperado em
            </label>
            <select
              id={`expected-currency-${variant}`}
              value={settings.expectedCurrency}
              onChange={(e) => update({ expectedCurrency: e.target.value as CurrencyKind })}
            >
              {CURRENCY_OPTIONS.map((kind) => (
                <option key={kind} value={kind}>
                  {CURRENCY_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>

          <div className="currency-toolbar-group">
            <label className="field-label" htmlFor={`mistaken-currency-${variant}`}>
              Listado por engano em
            </label>
            <select
              id={`mistaken-currency-${variant}`}
              value={settings.mistakenCurrency}
              onChange={(e) => update({ mistakenCurrency: e.target.value as CurrencyKind })}
            >
              {CURRENCY_OPTIONS.map((kind) => (
                <option key={kind} value={kind}>
                  {CURRENCY_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {variant === 'snipes' && (
        <div className="currency-toolbar-group">
          <label className="field-label" htmlFor={`min-snipe-profit-${variant}`}>
            Lucro mínimo <CurrencyIcon kind={settings.displayCurrency} />
          </label>
          <input
            id={`min-snipe-profit-${variant}`}
            type="number"
            min={0}
            step={0.1}
            value={fromChaos(settings.minSnipeProfitChaos, settings.displayCurrency, rates)}
            onChange={(e) => {
              const amount = e.target.value === '' ? 0 : Number(e.target.value);
              update({
                minSnipeProfitChaos: toChaos(amount, settings.displayCurrency, rates),
              });
            }}
          />
        </div>
      )}

      {variant === 'mistakes' && mistakeInvalid && (
        <p className="currency-toolbar-hint">
          Escolha moedas diferentes para detectar erros de listagem.
        </p>
      )}
    </div>
  );
}
