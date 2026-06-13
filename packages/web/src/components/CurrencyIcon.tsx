const CURRENCIES = {
  chaos: {
    src: 'https://web.poecdn.com/image/Art/2DItems/Currency/CurrencyRerollRare.png',
    label: 'Chaos Orb',
  },
  divine: {
    src: 'https://web.poecdn.com/image/Art/2DItems/Currency/CurrencyModValues.png',
    label: 'Divine Orb',
  },
  exalted: {
    src: 'https://web.poecdn.com/image/Art/2DItems/Currency/CurrencyAddModToRare.png',
    label: 'Exalted Orb',
  },
} as const;

export type CurrencyKind = keyof typeof CURRENCIES;

interface Props {
  kind: CurrencyKind;
}

export function CurrencyIcon({ kind }: Props) {
  const currency = CURRENCIES[kind];
  return (
    <img
      className="currency-icon"
      src={currency.src}
      alt={currency.label}
      title={currency.label}
      width={20}
      height={20}
      loading="lazy"
    />
  );
}
