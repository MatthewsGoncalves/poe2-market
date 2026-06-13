import type { SnipeResult, ExchangeRates } from '../api';
import type { CurrencyKind } from './CurrencyIcon';
import { CurrencyIcon } from './CurrencyIcon';
import { MarketLink } from './MarketLink';
import { Pagination } from './Pagination';
import { PriceAmount } from './PriceAmount';
import { usePagination } from '../hooks/usePagination';

interface Props {
  snipes: SnipeResult[];
  league: string;
  displayCurrency: CurrencyKind;
  rates: ExchangeRates;
}

export function SnipePanel({ snipes, league, displayCurrency, rates }: Props) {
  const { page, setPage, totalPages, pageItems, pageSize, total } = usePagination(snipes);

  if (snipes.length === 0) {
    return <p className="empty-state">No opportunities found</p>;
  }

  return (
    <>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col" className="num">Links</th>
            <th scope="col" className="num">
              Mean <CurrencyIcon kind={displayCurrency} />
            </th>
            <th scope="col" className="num">
              Min <CurrencyIcon kind={displayCurrency} />
            </th>
            <th scope="col" className="num">
              Profit <CurrencyIcon kind={displayCurrency} />
            </th>
            <th scope="col" className="num">Discount</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((s, i) => (
            <tr key={`${s.name}-${s.linkCount}-${(page - 1) * pageSize + i}`}>
              <td>
                <span className="item-name-cell">
                  <span className="item-name">{s.name}</span>
                  <MarketLink
                    league={league}
                    itemName={s.name}
                    options={s.linkCount > 0 ? { linkCount: s.linkCount } : undefined}
                  />
                </span>
              </td>
              <td className="num">{s.linkCount}</td>
              <td className="num">
                <PriceAmount chaos={s.meanChaos} currency={displayCurrency} rates={rates} />
              </td>
              <td className="num">
                <PriceAmount chaos={s.minChaos} currency={displayCurrency} rates={rates} />
              </td>
              <td className="num profit">
                <PriceAmount chaos={s.profitChaos} currency={displayCurrency} rates={rates} />
              </td>
              <td className="num">{s.discountPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        label="Snipe opportunities"
      />
    </>
  );
}
