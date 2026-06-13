const TRADE_BASE = 'https://www.pathofexile.com/trade2/search/poe2';

export interface TradeSearchOptions {
  linkCount?: number;
  gemLevel?: number;
  gemQuality?: number;
  corrupted?: boolean;
}

function encodeLeague(league: string): string {
  return league
    .replace(/ /g, '+')
    .replace(/[^A-Za-z0-9\-._~+]/g, (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
    );
}

function buildTradeQuery(itemName: string, options?: TradeSearchOptions) {
  const query: Record<string, unknown> = {
    status: { option: 'online' },
    name: itemName,
    stats: [{ type: 'and', filters: [] }],
  };

  const filters: Record<string, unknown> = {};
  const miscFilters: Record<string, unknown> = {};

  if (options?.linkCount != null && options.linkCount > 0) {
    filters.socket_filters = {
      disabled: false,
      filters: {
        links: { min: options.linkCount, max: options.linkCount },
      },
    };
  }

  if (options?.gemLevel != null && options.gemLevel > 0) {
    miscFilters.gem_level = { min: options.gemLevel, max: options.gemLevel };
  }

  if (options?.gemQuality != null && options.gemQuality > 0) {
    miscFilters.gem_quality = { min: options.gemQuality, max: options.gemQuality };
  }

  if (options?.corrupted != null) {
    miscFilters.corrupted = { option: options.corrupted ? 'true' : 'false' };
  }

  if (Object.keys(miscFilters).length > 0) {
    filters.misc_filters = { disabled: false, filters: miscFilters };
  }

  if (Object.keys(filters).length > 0) {
    query.filters = filters;
  }

  return {
    query,
    sort: { price: 'asc' },
  };
}

export function buildTradeFallbackUrl(league: string): string {
  return `${TRADE_BASE}/${encodeLeague(league)}`;
}

export function buildTradeSearchUrl(
  league: string,
  itemName: string,
  options?: TradeSearchOptions,
): string {
  const query = encodeURIComponent(JSON.stringify(buildTradeQuery(itemName, options)));
  return `${TRADE_BASE}/${encodeLeague(league)}?q=${query}`;
}
