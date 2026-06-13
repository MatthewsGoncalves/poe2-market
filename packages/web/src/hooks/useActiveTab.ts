import type { AppTab } from '../components/TabBar';

const STORAGE_KEY = 'poe2-market-active-tab';

const VALID_TABS: AppTab[] = ['snipes', 'mistakes', 'evaluator'];

export function readActiveTab(): AppTab {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_TABS.includes(stored as AppTab)) {
      return stored as AppTab;
    }
  } catch {
    // ignore
  }
  return 'snipes';
}

export function saveActiveTab(tab: AppTab): void {
  localStorage.setItem(STORAGE_KEY, tab);
}
