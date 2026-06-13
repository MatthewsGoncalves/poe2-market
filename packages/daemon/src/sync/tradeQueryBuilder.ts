import type { AffixKind, ParsedItem } from './itemParser.js';
import { extractStatValues, resolveStat, type StatIndex } from './statIndex.js';
import type { TradeItemMatch, TradeItemsCache } from './tradeItemIndex.js';

export interface MatchedMod {
  index: number;
  raw: string;
  matched: boolean;
  statId?: string;
  statText?: string;
  group?: string;
  /** Suggested minimum value (first roll on the line), when numeric. */
  value?: number;
  /** From advanced mod descriptions. */
  affix?: AffixKind;
  tier?: number;
  modName?: string;
}

/** Per-mod selection coming from the UI, keyed by the mod's index. */
export interface ModSelection {
  enabled: boolean;
  min?: number;
}

const RARITY_OPTION: Record<string, string> = {
  Normal: 'normal',
  Magic: 'magic',
  Rare: 'rare',
  Unique: 'unique',
};

function statGroup(statFilters: Record<string, unknown>[]) {
  return [{ type: 'and', disabled: false, filters: statFilters }];
}

function finalizeTradeBody(query: Record<string, unknown>): Record<string, unknown> {
  return { ...query, engine: 'new' };
}

/** Resolve every parsed mod to a trade stat entry (or mark it unmatched). */
export function matchItemMods(parsed: ParsedItem, statIndex: StatIndex): MatchedMod[] {
  return parsed.mods.map((mod, index) => {
    const entry = resolveStat(mod.raw, statIndex, mod.group);
    const base: MatchedMod = { index, raw: mod.raw, matched: false };
    if (mod.affix) base.affix = mod.affix;
    if (mod.tier != null) base.tier = mod.tier;
    if (mod.modName) base.modName = mod.modName;

    if (!entry) return base;

    const matched: MatchedMod = {
      ...base,
      matched: true,
      statId: entry.id,
      statText: entry.text,
      group: entry.group,
    };
    if (mod.values.length > 0) matched.value = mod.values[0];
    return matched;
  });
}

function findTypeMatch(
  parsed: ParsedItem,
  itemIndex: TradeItemsCache,
): { category?: string; type: string } | null {
  const candidates = [parsed.baseType, parsed.name].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );

  for (const candidate of candidates) {
    const exact = itemIndex.byType.get(candidate);
    if (exact && exact.kind === 'type') {
      return { category: exact.category, type: exact.type };
    }
  }

  // Magic items carry affix words around the base type, so fall back to the
  // longest known base type contained in the candidate lines.
  let best: { category?: string; type: string } | null = null;
  for (const candidate of candidates) {
    for (const [type, match] of itemIndex.byType) {
      if (match.kind !== 'type') continue;
      if (candidate.includes(type) && (!best || type.length > best.type.length)) {
        best = { category: match.category, type: match.type };
      }
    }
  }
  return best;
}

export interface ExtraStat {
  id: string;
  min?: number;
}

export interface BuildQueryOptions {
  /** Force corrupted filter regardless of parsed flag. */
  corrupted?: boolean;
  /** Additional stat filters added manually via mod autocomplete. */
  extraStats?: ExtraStat[];
}

export function buildPreciseQuery(
  parsed: ParsedItem,
  matched: MatchedMod[],
  itemIndex: TradeItemsCache,
  selections: Record<number, ModSelection> | undefined,
  options?: BuildQueryOptions,
): Record<string, unknown> {
  const statFilters: Record<string, unknown>[] = [];

  for (const mod of matched) {
    if (!mod.matched || !mod.statId) continue;
    const selection = selections?.[mod.index];
    const enabled = selection ? selection.enabled : true;
    if (!enabled) continue;

    const min = selection?.min ?? mod.value;
    const filter: Record<string, unknown> = { id: mod.statId, disabled: false };
    if (typeof min === 'number' && Number.isFinite(min)) {
      filter.value = { min };
    }
    statFilters.push(filter);
  }

  for (const extra of options?.extraStats ?? []) {
    if (!extra.id) continue;
    const filter: Record<string, unknown> = { id: extra.id, disabled: false };
    if (typeof extra.min === 'number' && Number.isFinite(extra.min)) {
      filter.value = { min: extra.min };
    }
    statFilters.push(filter);
  }

  const query: Record<string, unknown> = {
    status: { option: 'any' },
    stats: statGroup(statFilters),
  };

  const typeFilters: Record<string, unknown> = {};

  if (parsed.rarity === 'Unique' && parsed.name && itemIndex.byName.has(parsed.name)) {
    query.name = parsed.name;
    typeFilters.rarity = { option: 'unique' };
  } else {
    const typeMatch = findTypeMatch(parsed, itemIndex);
    if (typeMatch) {
      query.type = typeMatch.type;
      if (typeMatch.category) typeFilters.category = { option: typeMatch.category };
    }
    const rarityOption = RARITY_OPTION[parsed.rarity];
    if (rarityOption && parsed.rarity !== 'Unknown') {
      typeFilters.rarity = { option: rarityOption };
    }
  }

  const miscFilters: Record<string, unknown> = {};
  const corrupted = options?.corrupted ?? parsed.corrupted;
  if (corrupted) miscFilters.corrupted = { option: 'true' };
  if (parsed.gemLevel != null && parsed.gemLevel > 0) {
    miscFilters.gem_level = { min: parsed.gemLevel };
  }
  if (parsed.gemQuality != null && parsed.gemQuality > 0) {
    miscFilters.gem_quality = { min: parsed.gemQuality };
  }

  const filters: Record<string, unknown> = {};
  if (Object.keys(typeFilters).length > 0) {
    filters.type_filters = { disabled: false, filters: typeFilters };
  }
  if (Object.keys(miscFilters).length > 0) {
    filters.misc_filters = { disabled: false, filters: miscFilters };
  }
  if (Object.keys(filters).length > 0) {
    query.filters = filters;
  }

  return finalizeTradeBody({ query, sort: { price: 'asc' } });
}

export interface FilteredTradeOptions {
  gemLevel?: number;
  gemQuality?: number;
  corrupted?: boolean;
  mods?: string[];
  maxPriceChaos?: number;
}

/** Build a trade query from an item name + optional mod lines and price cap (snipe links). */
export function buildFilteredTradeQuery(
  match: TradeItemMatch,
  statIndex: StatIndex,
  options?: FilteredTradeOptions,
): Record<string, unknown> {
  const statFilters: Record<string, unknown>[] = [];

  for (const line of options?.mods ?? []) {
    const entry = resolveStat(line, statIndex);
    if (!entry) continue;
    const values = extractStatValues(line);
    const filter: Record<string, unknown> = { id: entry.id, disabled: false };
    if (values.length > 0 && Number.isFinite(values[0])) {
      filter.value = { min: values[0] };
    }
    statFilters.push(filter);
  }

  const query: Record<string, unknown> = {
    status: { option: 'any' },
    stats: statGroup(statFilters),
  };

  switch (match.kind) {
    case 'unique':
      query.name = match.name;
      query.filters = {
        type_filters: {
          disabled: false,
          filters: { rarity: { option: 'unique' } },
        },
      };
      break;
    case 'type':
      query.type = match.type;
      query.filters = {
        type_filters: {
          disabled: false,
          filters: {
            category: { option: match.category },
          },
        },
      };
      break;
  }

  const miscFilters: Record<string, unknown> = {};
  if (options?.gemLevel != null && options.gemLevel > 0) {
    miscFilters.gem_level = { min: options.gemLevel, max: options.gemLevel };
  }
  if (options?.gemQuality != null && options.gemQuality > 0) {
    miscFilters.gem_quality = { min: options.gemQuality, max: options.gemQuality };
  }
  if (options?.corrupted != null) {
    miscFilters.corrupted = { option: options.corrupted ? 'true' : 'false' };
  }

  const filters = (query.filters ?? {}) as Record<string, unknown>;
  if (Object.keys(miscFilters).length > 0) {
    filters.misc_filters = { disabled: false, filters: miscFilters };
  }
  if (options?.maxPriceChaos != null && options.maxPriceChaos > 0) {
    filters.trade_filters = {
      disabled: false,
      filters: {
        price: { max: Math.ceil(options.maxPriceChaos * 1.05), option: 'chaos' },
      },
    };
  }
  if (Object.keys(filters).length > 0) {
    query.filters = filters;
  }

  return finalizeTradeBody({ query, sort: { price: 'asc' } });
}
