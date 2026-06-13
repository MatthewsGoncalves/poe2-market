export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.message = message;
  }
}

// --- Response types (replicated from daemon types, no cross-package import) ---

export interface ExchangeRates {
  divineInChaos: number;
  exaltedInChaos: number;
}

export interface StatusResponse {
  league: string;
  expansionName?: string;
  lastSyncAt: string;
  itemCount: number;
  rates: ExchangeRates;
  stale: boolean;
}

export type ItemRarityKind =
  | 'normal'
  | 'magic'
  | 'rare'
  | 'unique'
  | 'gem'
  | 'currency'
  | 'card';

export interface SnipeResult {
  name: string;
  linkCount: number;
  meanChaos: number;
  minChaos: number;
  profitChaos: number;
  discountPct: number;
  icon?: string;
  category?: string;
  rarity?: ItemRarityKind;
  mods?: string[];
  gemLevel?: number;
  gemQuality?: number;
  gemIsCorrupted?: boolean;
}

export interface SnipesResponse {
  results: SnipeResult[];
  generatedAt: string;
}

export interface CurrencyErrorResult {
  name: string;
  expectedAmount: number;
  expectedCurrency: 'chaos' | 'divine' | 'exalted';
  listedMinChaos: number;
  listedAsAmount: number;
  mistakenCurrency: 'chaos' | 'divine' | 'exalted';
}

export interface CurrencyErrorsResponse {
  alerts: CurrencyErrorResult[];
  generatedAt: string;
}

export type ItemEvaluationResponse =
  | {
      found: true;
      name: string;
      meanChaos: number;
      minChaos: number;
      meanDivine: number;
      suggestedListPrice: number;
      lowConfidence: boolean;
    }
  | { found: false; name: string };

export interface HealthResponse {
  ok: boolean;
}

export type AffixKind = 'prefix' | 'suffix';

export interface ParsedMod {
  raw: string;
  values: number[];
  group?: string;
  affix?: AffixKind;
  tier?: number;
  modName?: string;
}

export interface ParsedItem {
  itemClass?: string;
  rarity: string;
  name?: string;
  baseType?: string;
  itemLevel?: number;
  quality?: number;
  corrupted: boolean;
  gemLevel?: number;
  gemQuality?: number;
  mods: ParsedMod[];
  icon?: string;
}

export interface MatchedMod {
  index: number;
  raw: string;
  matched: boolean;
  statId?: string;
  statText?: string;
  group?: string;
  value?: number;
  affix?: AffixKind;
  tier?: number;
  modName?: string;
}

export interface ParseItemResponse {
  parsed: ParsedItem;
  matchedMods: MatchedMod[];
}

export interface ModSelection {
  enabled: boolean;
  min?: number;
}

export interface TradeSearchResponse {
  url: string;
  total: number | null;
  parsed: ParsedItem;
  matchedMods: MatchedMod[];
}

export interface ExtraStat {
  id: string;
  min?: number;
}

export interface TradeSearchParams {
  league: string;
  itemText: string;
  selections?: Record<number, ModSelection>;
  corrupted?: boolean;
  extraStats?: ExtraStat[];
}

export interface ItemNameSuggestion {
  name: string;
  icon?: string;
}

export interface StatSuggestion {
  id: string;
  text: string;
  group: string;
}

// --- Request param types ---

export interface SnipesParams {
  minProfit?: number;
  maxResults?: number;
  currency?: 'chaos' | 'divine' | 'exalted';
}

export interface CurrencyErrorsParams {
  expected?: 'chaos' | 'divine' | 'exalted';
  mistaken?: 'chaos' | 'divine' | 'exalted';
}

export interface EvaluateParams {
  name: string;
  linkCount?: number;
  gemLevel?: number;
  gemQuality?: number;
  corrupted?: boolean;
}

// --- Internal helpers ---

function baseUrl(): string {
  return import.meta.env.VITE_DAEMON_URL ?? 'http://localhost:3001';
}

async function request<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
  return res.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    let message = text || res.statusText;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed?.error) message = parsed.error;
    } catch {
      // keep raw text
    }
    throw new ApiError(res.status, message);
  }
  return JSON.parse(text) as T;
}

// --- Public API ---

export async function fetchStatus(): Promise<StatusResponse> {
  return request<StatusResponse>(`${baseUrl()}/api/status`);
}

export async function fetchSnipes(params?: SnipesParams): Promise<SnipesResponse> {
  const url = new URL(`${baseUrl()}/api/snipes`);
  if (params?.minProfit !== undefined) url.searchParams.set('minProfit', String(params.minProfit));
  if (params?.maxResults !== undefined) url.searchParams.set('maxResults', String(params.maxResults));
  if (params?.currency !== undefined) url.searchParams.set('currency', params.currency);
  return request<SnipesResponse>(url.toString());
}

export async function fetchCurrencyErrors(
  params?: CurrencyErrorsParams,
): Promise<CurrencyErrorsResponse> {
  const url = new URL(`${baseUrl()}/api/currency-errors`);
  if (params?.expected !== undefined) url.searchParams.set('expected', params.expected);
  if (params?.mistaken !== undefined) url.searchParams.set('mistaken', params.mistaken);
  return request<CurrencyErrorsResponse>(url.toString());
}

export async function evaluateItem(params: EvaluateParams): Promise<ItemEvaluationResponse> {
  const url = new URL(`${baseUrl()}/api/evaluate`);
  url.searchParams.set('name', params.name);
  if (params.linkCount !== undefined) url.searchParams.set('linkCount', String(params.linkCount));
  if (params.gemLevel !== undefined) url.searchParams.set('gemLevel', String(params.gemLevel));
  if (params.gemQuality !== undefined) url.searchParams.set('gemQuality', String(params.gemQuality));
  if (params.corrupted !== undefined) url.searchParams.set('corrupted', String(params.corrupted));
  return request<ItemEvaluationResponse>(url.toString());
}

export async function checkHealth(): Promise<HealthResponse> {
  return request<HealthResponse>(`${baseUrl()}/api/health`);
}

export async function parseItem(itemText: string): Promise<ParseItemResponse> {
  return postJson<ParseItemResponse>(`${baseUrl()}/api/parse-item`, { itemText });
}

export async function tradeSearch(params: TradeSearchParams): Promise<TradeSearchResponse> {
  return postJson<TradeSearchResponse>(`${baseUrl()}/api/trade-search`, params);
}

export async function searchItemNames(q: string): Promise<{ results: ItemNameSuggestion[] }> {
  const url = new URL(`${baseUrl()}/api/item-names`);
  url.searchParams.set('q', q);
  return request<{ results: ItemNameSuggestion[] }>(url.toString());
}

export async function searchStats(q: string): Promise<{ results: StatSuggestion[] }> {
  const url = new URL(`${baseUrl()}/api/stats`);
  url.searchParams.set('q', q);
  return request<{ results: StatSuggestion[] }>(url.toString());
}
