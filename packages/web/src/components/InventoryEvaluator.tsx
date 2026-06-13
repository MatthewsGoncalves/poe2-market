import { useState } from 'react';
import { evaluateItem } from '../api';
import type { ItemEvaluationResponse } from '../api';
import type { ExchangeRates } from '../api';
import type { CurrencyKind } from './CurrencyIcon';
import { MarketLink } from './MarketLink';
import { PriceAmount } from './PriceAmount';

interface Props {
  league: string;
  displayCurrency: CurrencyKind;
  rates: ExchangeRates;
}

export function InventoryEvaluator({ league, displayCurrency, rates }: Props) {
  const [name, setName] = useState('');
  const [linkCount, setLinkCount] = useState<number | undefined>(undefined);
  const [gemLevel, setGemLevel] = useState<number | undefined>(undefined);
  const [gemQuality, setGemQuality] = useState<number | undefined>(undefined);
  const [corrupted, setCorrupted] = useState(false);
  const [result, setResult] = useState<ItemEvaluationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Item name is required');
      return;
    }
    setError(null);
    try {
      const res = await evaluateItem({
        name,
        linkCount,
        gemLevel,
        gemQuality,
        ...(corrupted ? { corrupted: true } : {}),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evaluation failed');
    }
  };

  return (
    <div className="evaluator">
      <form className="evaluator-form" onSubmit={handleSubmit}>
        <div className="field">
          <label className="field-label" htmlFor="eval-name">
            Item name
          </label>
          <input
            id="eval-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Headhunter"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="eval-links">
            Link count
          </label>
          <input
            id="eval-links"
            type="number"
            value={linkCount ?? ''}
            onChange={(e) =>
              setLinkCount(e.target.value === '' ? undefined : Number(e.target.value))
            }
            placeholder="0–6"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="eval-gem-level">
            Gem level
          </label>
          <input
            id="eval-gem-level"
            type="number"
            value={gemLevel ?? ''}
            onChange={(e) =>
              setGemLevel(e.target.value === '' ? undefined : Number(e.target.value))
            }
            placeholder="1–21"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="eval-gem-quality">
            Gem quality
          </label>
          <input
            id="eval-gem-quality"
            type="number"
            value={gemQuality ?? ''}
            onChange={(e) =>
              setGemQuality(e.target.value === '' ? undefined : Number(e.target.value))
            }
            placeholder="0–23"
          />
        </div>
        <div className="evaluator-options">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={corrupted}
              onChange={(e) => setCorrupted(e.target.checked)}
            />
            Corrupted
          </label>
          <button type="submit" className="btn-primary">
            Evaluate
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="eval-error">
          {error}
        </p>
      )}
      {result !== null && (
        <div className="eval-result">
          {result.found ? (
            <div>
              <div className="eval-result-header">
                <p className="eval-result-name">{result.name}</p>
                <MarketLink
                  league={league}
                  itemName={result.name}
                  options={{
                    linkCount,
                    gemLevel,
                    gemQuality,
                    corrupted: corrupted || undefined,
                  }}
                />
              </div>
              {result.lowConfidence && (
                <p role="alert" className="eval-warning">
                  Low confidence — few active listings. Do not rely on this price for resale.
                </p>
              )}
              <div className="eval-grid">
                <p className="eval-stat">
                  Mean:{' '}
                  <PriceAmount chaos={result.meanChaos} currency={displayCurrency} rates={rates} />
                </p>
                <p className="eval-stat">
                  Min:{' '}
                  <PriceAmount chaos={result.minChaos} currency={displayCurrency} rates={rates} />
                </p>
                <p className="eval-stat highlight">
                  Suggested list price:{' '}
                  <PriceAmount
                    chaos={result.suggestedListPrice}
                    currency={displayCurrency}
                    rates={rates}
                  />
                </p>
              </div>
            </div>
          ) : (
            <p className="empty-state">Item not found</p>
          )}
        </div>
      )}
    </div>
  );
}
