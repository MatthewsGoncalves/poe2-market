import { useState, useEffect, useCallback } from 'react';
import { fetchStatus, fetchSnipes, fetchCurrencyErrors } from './api';
import type { StatusResponse, SnipeResult, CurrencyErrorResult } from './api';
import { StatusHeader } from './components/StatusHeader';
import { SnipePanel } from './components/SnipePanel';
import { CurrencyErrorPanel } from './components/CurrencyErrorPanel';
import { InventoryEvaluator } from './components/InventoryEvaluator';
import { CurrencyToolbar } from './components/CurrencyToolbar';
import { TabBar, type AppTab } from './components/TabBar';
import {
  readCurrencySettings,
  saveCurrencySettings,
  type CurrencySettings,
} from './hooks/useCurrencySettings';
import { readActiveTab, saveActiveTab } from './hooks/useActiveTab';

const RATES_FALLBACK = { divineInChaos: 1, exaltedInChaos: 1 };

export function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [snipes, setSnipes] = useState<SnipeResult[]>([]);
  const [alerts, setAlerts] = useState<CurrencyErrorResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [currencySettings, setCurrencySettings] = useState<CurrencySettings>(readCurrencySettings);
  const [activeTab, setActiveTab] = useState<AppTab>(readActiveTab);

  const league = status?.league ?? 'Standard';
  const rates = status?.rates ?? RATES_FALLBACK;

  const refreshMarketData = useCallback(async () => {
    const [snipesRes, errorsRes] = await Promise.all([
      fetchSnipes({
        minProfit: currencySettings.minSnipeProfit,
        currency: currencySettings.displayCurrency,
      }),
      fetchCurrencyErrors({
        expected: currencySettings.expectedCurrency,
        mistaken: currencySettings.mistakenCurrency,
      }),
    ]);
    setSnipes(snipesRes.results);
    setAlerts(errorsRes.alerts);
  }, [currencySettings]);

  const handleCurrencyChange = (settings: CurrencySettings) => {
    setCurrencySettings(settings);
    saveCurrencySettings(settings);
  };

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab);
    saveActiveTab(tab);
  };

  useEffect(() => {
    const poll = async () => {
      try {
        const s = await fetchStatus();
        setStatus(s);
        setFetchError(null);
        setLoading(false);
      } catch (err) {
        setLoading(false);
        setFetchError(err instanceof Error ? err.message : 'Daemon unreachable');
      }
    };

    poll();
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!status?.lastSyncAt || loading) return;
    refreshMarketData().catch((err) => {
      setFetchError(err instanceof Error ? err.message : 'Failed to refresh market data');
    });
  }, [status?.lastSyncAt, currencySettings, loading, refreshMarketData]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" aria-hidden="true" />
        <p>Loading market data…</p>
      </div>
    );
  }

  const tabs = [
    { id: 'snipes' as const, label: 'Snipes', badge: snipes.length },
    { id: 'mistakes' as const, label: 'Erros de moeda', badge: alerts.length },
    { id: 'evaluator' as const, label: 'Avaliador' },
  ];

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">PoE 2 Market</h1>
        {status && (
          <StatusHeader status={status} displayCurrency={currencySettings.displayCurrency} />
        )}
      </header>

      <TabBar tabs={tabs} active={activeTab} onChange={handleTabChange} />

      {fetchError && (
        <div role="alert" className="banner banner-error">
          Could not reach daemon: {fetchError}
        </div>
      )}

      <main className="app-main">
        <section
          role="tabpanel"
          id="panel-snipes"
          aria-labelledby="tab-snipes"
          hidden={activeTab !== 'snipes'}
          className="tab-panel"
        >
          <header className="tab-panel-header">
            <div>
              <h2 className="panel-title">Snipe opportunities</h2>
              <p className="panel-subtitle">
                Items listed well below their market average
              </p>
            </div>
          </header>
          <CurrencyToolbar
            settings={currencySettings}
            onChange={handleCurrencyChange}
            variant="snipes"
          />
          <SnipePanel
            snipes={snipes}
            league={league}
            displayCurrency={currencySettings.displayCurrency}
            rates={rates}
          />
        </section>

        <section
          role="tabpanel"
          id="panel-mistakes"
          aria-labelledby="tab-mistakes"
          hidden={activeTab !== 'mistakes'}
          className="tab-panel"
        >
          <header className="tab-panel-header">
            <div>
              <h2 className="panel-title">Currency mistakes</h2>
              <p className="panel-subtitle">
                Listings priced in the wrong currency (
                {currencySettings.expectedCurrency} listed as {currencySettings.mistakenCurrency})
              </p>
            </div>
          </header>
          <CurrencyToolbar
            settings={currencySettings}
            onChange={handleCurrencyChange}
            variant="mistakes"
          />
          <CurrencyErrorPanel
            alerts={alerts}
            league={league}
            displayCurrency={currencySettings.displayCurrency}
            rates={rates}
          />
        </section>

        <section
          role="tabpanel"
          id="panel-evaluator"
          aria-labelledby="tab-evaluator"
          hidden={activeTab !== 'evaluator'}
          className="tab-panel"
        >
          <header className="tab-panel-header">
            <div>
              <h2 className="panel-title">Item evaluator</h2>
              <p className="panel-subtitle">
                Check the market value of an item before listing it
              </p>
            </div>
          </header>
          <CurrencyToolbar
            settings={currencySettings}
            onChange={handleCurrencyChange}
            variant="evaluator"
          />
          <InventoryEvaluator
            league={league}
            displayCurrency={currencySettings.displayCurrency}
            rates={rates}
          />
        </section>
      </main>
    </div>
  );
}
