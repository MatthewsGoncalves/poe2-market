import type { ExchangeRates } from '../api';
import type { CurrencyKind } from './CurrencyIcon';
import { CurrencyIcon } from './CurrencyIcon';
import { formatPrice, fromChaos } from '../utils/currency';

interface Props {
  chaos: number;
  currency: CurrencyKind;
  rates: ExchangeRates;
  className?: string;
}

export function PriceAmount({ chaos, currency, rates, className }: Props) {
  const amount = fromChaos(chaos, currency, rates);
  return (
    <span className={className}>
      {formatPrice(amount)} <CurrencyIcon kind={currency} />
    </span>
  );
}
