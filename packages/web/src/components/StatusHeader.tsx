import type { StatusResponse } from '../api';
import type { CurrencyKind } from './CurrencyIcon';
import { CurrencyIcon } from './CurrencyIcon';
import { formatPrice, fromChaos } from '../utils/currency';

interface Props {
  status: StatusResponse;
  displayCurrency: CurrencyKind;
}

function formatLastSync(lastSyncAt: string): string {
  if (!lastSyncAt) {
    return 'Waiting for first sync';
  }
  return new Date(lastSyncAt).toLocaleString();
}

export function StatusHeader({ status, displayCurrency }: Props) {
  const lastSyncLabel = formatLastSync(status.lastSyncAt);
  const divineRate = fromChaos(status.rates.divineInChaos, displayCurrency, status.rates);
  const exaltedRate = fromChaos(status.rates.exaltedInChaos, displayCurrency, status.rates);

  return (
    <div className="status-bar">
      {status.stale && (
        <div role="alert" className="banner banner-warning">
          Stale data — last sync: {lastSyncLabel}
        </div>
      )}
      <div className="status-item">
        <span className="status-label">League</span>
        <span className="status-value">
          {status.league}
          {status.expansionName && (
            <span className="status-league-context"> · {status.expansionName}</span>
          )}
        </span>
      </div>
      <div className="status-item">
        <span className="status-label">Last sync</span>
        <span className="status-value">{lastSyncLabel}</span>
      </div>
      <div className="status-item">
        <span className="status-label">Items tracked</span>
        <span className="status-value">{status.itemCount.toLocaleString()}</span>
      </div>
      <div className="status-item">
        <span className="status-label">Exchange rates</span>
        <span className="status-value">
          1 <CurrencyIcon kind="divine" /> = {formatPrice(divineRate)}{' '}
          <CurrencyIcon kind={displayCurrency} />
          <span className="rate-sep">·</span>
          1 <CurrencyIcon kind="exalted" /> = {formatPrice(exaltedRate)}{' '}
          <CurrencyIcon kind={displayCurrency} />
        </span>
      </div>
    </div>
  );
}
