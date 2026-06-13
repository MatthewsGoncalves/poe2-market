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

export interface SnipeResult {
  name: string;
  linkCount: number;
  meanChaos: number;
  minChaos: number;
  profitChaos: number;
  discountPct: number;
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
