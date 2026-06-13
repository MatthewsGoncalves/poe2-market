import axios from 'axios';

const TRADE_ITEMS_URL = 'https://www.pathofexile.com/api/trade2/data/items?realm=poe2';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const POE2_CURRENCY_NAMES = new Set([
  'Chaos Orb',
  'Divine Orb',
  'Exalted Orb',
  'Mirror of Kalandra',
]);

export type TradeItemMatch =
  | { kind: 'unique'; name: string }
  | { kind: 'type'; category: string; type: string };

interface TradeItemEntry {
  type?: string;
  text?: string;
  name?: string;
  disc?: string;
}

interface TradeItemCategory {
  id: string;
  entries?: TradeItemEntry[];
}

export interface TradeItemsCache {
  loadedAt: number;
  byName: Map<string, TradeItemMatch>;
  byType: Map<string, TradeItemMatch>;
}

let cache: TradeItemsCache | null = null;

function tradeDataHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Origin: 'https://www.pathofexile.com',
    Referer: 'https://www.pathofexile.com/trade2',
  };
}

function addTypeMatch(
  byType: Map<string, TradeItemMatch>,
  category: string,
  type: string,
): void {
  if (!byType.has(type)) {
    byType.set(type, { kind: 'type', category, type });
  }
}

function buildIndex(categories: TradeItemCategory[]): TradeItemsCache {
  const byName = new Map<string, TradeItemMatch>();
  const byType = new Map<string, TradeItemMatch>();

  for (const category of categories) {
    for (const entry of category.entries ?? []) {
      if (entry.disc === 'legacy') continue;

      if (entry.name) {
        byName.set(entry.name, { kind: 'unique', name: entry.name });
      }
      if (entry.type) {
        addTypeMatch(byType, category.id, entry.type);
      }
    }
  }

  return { loadedAt: Date.now(), byName, byType };
}

export async function loadTradeItemIndex(force = false): Promise<TradeItemsCache> {
  if (!force && cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache;
  }

  const res = await axios.get(TRADE_ITEMS_URL, {
    headers: tradeDataHeaders(),
    timeout: 15_000,
    validateStatus: () => true,
  });

  if (res.status !== 200 || !Array.isArray(res.data?.result)) {
    throw new Error(`Failed to load trade item index (${res.status})`);
  }

  cache = buildIndex(res.data.result as TradeItemCategory[]);
  return cache;
}

export function resolveTradeItem(itemName: string, index: TradeItemsCache): TradeItemMatch | null {
  const trimmed = itemName.trim();
  if (trimmed.includes('(Legacy)')) return null;

  const byName = index.byName.get(trimmed);
  if (byName) return byName;

  const byType = index.byType.get(trimmed);
  if (byType) return byType;

  if (trimmed.endsWith(' Support')) {
    const gemType = trimmed.slice(0, -' Support'.length);
    const supportGem = index.byType.get(gemType);
    if (supportGem?.kind === 'type' && supportGem.category === 'gem') {
      return supportGem;
    }
  }

  return null;
}

export function isKnownPoe2TradeItem(itemName: string, index: TradeItemsCache): boolean {
  if (POE2_CURRENCY_NAMES.has(itemName)) return true;
  return resolveTradeItem(itemName, index) !== null;
}

export function resetTradeItemIndexForTests(): void {
  cache = null;
}

export function seedTradeItemIndexForTests(index: TradeItemsCache): void {
  cache = index;
}
