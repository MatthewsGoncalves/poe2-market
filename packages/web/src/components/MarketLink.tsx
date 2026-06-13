import { buildTradeSearchUrl } from '../utils/tradeUrl';
import type { TradeSearchOptions } from '../utils/tradeSearchOptions';

interface Props {
  league: string;
  itemName: string;
  options?: TradeSearchOptions;
}

function ExternalLinkIcon() {
  return (
    <svg
      className="market-link-icon"
      viewBox="0 0 16 16"
      width={16}
      height={16}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M10 2h4v4h-1.5V3.5L6.5 9.9 5.6 9 10.1 3.5H10V2ZM3 3h4.5v1.5H4.5v7h7V9.5H13v4.5H3V3Z"
      />
    </svg>
  );
}

export function MarketLink({ league, itemName, options }: Props) {
  const href = buildTradeSearchUrl(league, itemName, options);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="market-link"
      aria-label={`Open ${itemName} on trade site`}
      title="Open on trade site"
    >
      <ExternalLinkIcon />
    </a>
  );
}
