export type ItemRarityKind =
  | 'normal'
  | 'magic'
  | 'rare'
  | 'unique'
  | 'gem'
  | 'currency'
  | 'card';

export interface MarketItem {
  name: string;
  mean: number;
  min: number;
  linkCount?: number;
  gemLevel?: number;
  gemQuality?: number;
  gemIsCorrupted?: boolean;
  lowConfidence: boolean;
  icon?: string;
  category?: string;
  rarity?: ItemRarityKind;
  /** Modifier lines provided by poe.watch (usually only for tracked variants). */
  implicits?: string[];
  explicits?: string[];
}

export interface ExchangeRates {
  divineInChaos: number;
  exaltedInChaos: number;
}

export interface CacheState {
  items: MarketItem[];
  rates: ExchangeRates;
  lastSyncAt: string; // ISO 8601
  league: string;
}

export interface ItemEvaluation {
  name: string;
  meanChaos: number;
  minChaos: number;
  meanDivine: number;
  suggestedListPrice: number;
  lowConfidence: boolean;
  found: boolean;
}

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

export type CurrencyKind = 'chaos' | 'divine' | 'exalted';

export interface CurrencyErrorResult {
  name: string;
  expectedAmount: number;
  expectedCurrency: CurrencyKind;
  listedMinChaos: number;
  listedAsAmount: number;
  mistakenCurrency: CurrencyKind;
}
