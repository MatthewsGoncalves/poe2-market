import axios from 'axios';
import type { MarketItem, ExchangeRates } from '../types.js';

const DEFAULT_BASE_URL = 'https://api.poe.watch';
const POEWATCH_TIMEOUT_MS = 30_000;

export class PoeWatchApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(`poe.watch API returned ${statusCode}: ${responseBody}`);
    this.name = 'PoeWatchApiError';
  }
}

interface RawCompactItem {
  name: string;
  mean: number;
  min: number;
  links?: number;
  linkCount?: number;
  gemLevel?: number;
  gemQuality?: number;
  corrupted?: boolean;
  gemIsCorrupted?: boolean;
  lowConfidence?: boolean;
}

interface RawCompactResponse {
  items: RawCompactItem[];
}

function parseCompactPayload(data: unknown): RawCompactItem[] {
  if (Array.isArray(data)) return data;
  if (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as RawCompactResponse).items)
  ) {
    return (data as RawCompactResponse).items;
  }
  throw new PoeWatchApiError(200, 'Unexpected compact response shape');
}

function mapCompactItem(raw: RawCompactItem): MarketItem {
  const item: MarketItem = {
    name: raw.name,
    mean: raw.mean,
    min: raw.min,
    lowConfidence: raw.lowConfidence ?? false,
  };
  const links = raw.linkCount ?? raw.links;
  if (links != null && links > 0) item.linkCount = links;
  if (raw.gemLevel != null && raw.gemLevel > 0) item.gemLevel = raw.gemLevel;
  if (raw.gemQuality != null && raw.gemQuality > 0) item.gemQuality = raw.gemQuality;
  const corrupted = raw.gemIsCorrupted ?? raw.corrupted;
  if (corrupted != null) item.gemIsCorrupted = corrupted;
  return item;
}

interface RawExchangeItem {
  name: string;
  mean: number;
}

interface RawExchangeResponse {
  items: RawExchangeItem[];
}

function toErrorBody(data: unknown): string {
  return typeof data === 'string' ? data : JSON.stringify(data);
}

interface RawLeague {
  name: string;
}

export async function fetchLeagues(
  game: string,
  baseUrl = DEFAULT_BASE_URL,
): Promise<string[]> {
  try {
    const response = await axios.get<RawLeague[]>(`${baseUrl}/leagues`, {
      params: { game },
      timeout: POEWATCH_TIMEOUT_MS,
    });
    return response.data.map((league) => league.name);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response != null) {
      throw new PoeWatchApiError(err.response.status, toErrorBody(err.response.data));
    }
    throw err;
  }
}

export async function fetchCompact(
  league: string,
  game: string,
  baseUrl = DEFAULT_BASE_URL,
): Promise<MarketItem[]> {
  try {
    const response = await axios.get<unknown>(`${baseUrl}/compact`, {
      params: { league, game },
      timeout: POEWATCH_TIMEOUT_MS,
    });
    return parseCompactPayload(response.data).map(mapCompactItem);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response != null) {
      throw new PoeWatchApiError(err.response.status, toErrorBody(err.response.data));
    }
    throw err;
  }
}

export async function fetchRates(
  league: string,
  game: string,
  baseUrl = DEFAULT_BASE_URL,
): Promise<ExchangeRates> {
  try {
    const response = await axios.get<RawExchangeResponse>(`${baseUrl}/exchange/ratios`, {
      params: { league, game },
      timeout: POEWATCH_TIMEOUT_MS,
    });
    const items = response.data.items ?? [];
    const divine = items.find((i) => i.name === 'Divine Orb');
    const exalted = items.find((i) => i.name === 'Exalted Orb');
    const divineMean = divine?.mean;
    const exaltedMean = exalted?.mean;
    if (divineMean == null || exaltedMean == null) {
      const missing: string[] = [];
      if (divineMean == null) missing.push('Divine Orb');
      if (exaltedMean == null) missing.push('Exalted Orb');
      throw new PoeWatchApiError(
        response.status ?? 200,
        `Missing exchange rate(s): ${missing.join(', ')}`,
      );
    }
    return {
      divineInChaos: divineMean,
      exaltedInChaos: exaltedMean,
    };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response != null) {
      throw new PoeWatchApiError(err.response.status, toErrorBody(err.response.data));
    }
    throw err;
  }
}
