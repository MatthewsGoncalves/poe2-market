import type { CurrencyErrorResult, ExchangeRates } from '../api';
import type { CurrencyKind } from './CurrencyIcon';
import { CurrencyIcon } from './CurrencyIcon';
import { MarketLink } from './MarketLink';
import { Pagination } from './Pagination';
import { PriceAmount } from './PriceAmount';
import { formatPrice } from '../utils/currency';
import { usePagination } from '../hooks/usePagination';

interface Props {
  alerts: CurrencyErrorResult[];
  league: string;
  displayCurrency: CurrencyKind;
  rates: ExchangeRates;
}

export function CurrencyErrorPanel({ alerts, league, displayCurrency, rates }: Props) {
  const { page, setPage, totalPages, pageItems, pageSize, total } = usePagination(alerts);

  if (alerts.length === 0) {
    return <p className="empty-state">No alerts</p>;
  }

  return (
    <>
      <div className="alert-list">
        {pageItems.map((a, i) => (
          <div
            key={`${a.name}-${a.listedMinChaos}-${(page - 1) * pageSize + i}`}
            role="alert"
            className="alert-card"
          >
            <span className="alert-card-header">
              <strong>{a.name}</strong>
              <MarketLink league={league} itemName={a.name} />
            </span>
            <span className="alert-detail">
              expected {formatPrice(a.expectedAmount)}{' '}
              <CurrencyIcon kind={a.expectedCurrency} /> (listed as{' '}
              {formatPrice(a.listedAsAmount)} <CurrencyIcon kind={a.mistakenCurrency} />)
            </span>
            <span className="alert-detail">
              listed min:{' '}
              <PriceAmount chaos={a.listedMinChaos} currency={displayCurrency} rates={rates} />
            </span>
          </div>
        ))}
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        label="Currency mistakes"
      />
    </>
  );
}
