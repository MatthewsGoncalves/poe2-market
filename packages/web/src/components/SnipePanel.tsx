import type { SnipeResult, ExchangeRates } from '../api';
import type { CurrencyKind } from './CurrencyIcon';
import { CurrencyIcon } from './CurrencyIcon';
import { ItemIcon } from './ItemIcon';
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
                  <ItemIcon src={s.icon} alt={s.name} />
                  <span className="item-info">
                    <span className="item-name-row">
                      <span className={`item-name rarity-${s.rarity ?? 'normal'}`}>{s.name}</span>
                      <MarketLink
                        league={league}
                        itemName={s.name}
                        options={{
                          gemLevel: s.gemLevel,
                          gemQuality: s.gemQuality,
                          corrupted: s.gemIsCorrupted,
                          mods: s.mods,
                          maxPriceChaos: s.minChaos,
                        }}
                      />
                    </span>
                    {s.category && <span className="item-category">{s.category}</span>}
                    {s.mods && s.mods.length > 0 && (
                      <span className="item-mods">
                        {s.mods.map((mod, mi) => (
                          <span key={mi} className="item-mod">
                            {mod}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
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
