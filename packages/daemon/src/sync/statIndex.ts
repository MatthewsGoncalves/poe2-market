import axios from 'axios';

const TRADE_STATS_URL = 'https://www.pathofexile.com/api/trade2/data/stats';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Trade stat groups, in the priority order used when a mod line matches the
 * same normalized text across multiple groups and no explicit group tag was
 * present on the item line.
 */
const GROUP_PRIORITY = [
  'explicit',
  'implicit',
  'rune',
  'enchant',
  'fractured',
  'crafted',
  'desecrated',
  'sanctum',
  'skill',
  'pseudo',
];

export interface StatEntry {
  id: string;
  text: string;
  group: string;
}

export interface StatIndex {
  loadedAt: number;
  byText: Map<string, StatEntry[]>;
}

interface RawStatEntry {
  id: string;
  text: string;
  type?: string;
}

interface RawStatGroup {
  id: string;
  label?: string;
  entries?: RawStatEntry[];
}

let cache: StatIndex | null = null;

function statDataHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Origin: 'https://www.pathofexile.com',
    Referer: 'https://www.pathofexile.com/trade2',
  };
}

/**
 * Collapse every numeric token (with optional sign/decimals) into the `#`
 * placeholder used by the trade stat catalog, so an item line like
 * `+25 to maximum Life` matches the catalog text `# to maximum Life`.
 */
export function normalizeStatText(text: string): string {
  return text
    .replace(/[+-]?\d+(?:\.\d+)?/g, '#')
    .replace(/\s*\(augmented\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Extract the numeric values from an item mod line, in order of appearance. */
export function extractStatValues(text: string): number[] {
  const matches = text.match(/[+-]?\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

function buildIndex(groups: RawStatGroup[]): StatIndex {
  const byText = new Map<string, StatEntry[]>();

  for (const group of groups) {
    for (const entry of group.entries ?? []) {
      if (!entry.id || !entry.text) continue;
      const key = normalizeStatText(entry.text);
      const list = byText.get(key);
      const statEntry: StatEntry = { id: entry.id, text: entry.text, group: group.id };
      if (list) {
        list.push(statEntry);
      } else {
        byText.set(key, [statEntry]);
      }
    }
  }

  return { loadedAt: Date.now(), byText };
}

export async function loadStatIndex(force = false): Promise<StatIndex> {
  if (!force && cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache;
  }

  const res = await axios.get(TRADE_STATS_URL, {
    headers: statDataHeaders(),
    timeout: 15_000,
    validateStatus: () => true,
  });

  if (res.status !== 200 || !Array.isArray(res.data?.result)) {
    throw new Error(`Failed to load trade stat index (${res.status})`);
  }

  cache = buildIndex(res.data.result as RawStatGroup[]);
  return cache;
}

/**
 * Resolve a cleaned mod line (group tag already stripped) to a single stat
 * entry. When `preferredGroup` is provided (e.g. derived from a `(implicit)`
 * tag) it wins; otherwise the GROUP_PRIORITY order decides.
 */
export function resolveStat(
  modLine: string,
  index: StatIndex,
  preferredGroup?: string,
): StatEntry | null {
  const key = normalizeStatText(modLine);
  const entries = index.byText.get(key);
  if (!entries || entries.length === 0) return null;

  if (preferredGroup) {
    const preferred = entries.find((e) => e.group === preferredGroup);
    if (preferred) return preferred;
  }

  for (const group of GROUP_PRIORITY) {
    const match = entries.find((e) => e.group === group);
    if (match) return match;
  }

  return entries[0] ?? null;
}

/** Substring search across the catalog text for mod autocomplete. */
export function searchStats(query: string, index: StatIndex, limit = 20): StatEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];

  const seen = new Set<string>();
  const matches: StatEntry[] = [];
  for (const entries of index.byText.values()) {
    for (const entry of entries) {
      if (seen.has(entry.id)) continue;
      if (entry.text.toLowerCase().includes(q)) {
        seen.add(entry.id);
        matches.push(entry);
      }
    }
  }

  const rank = (group: string): number => {
    const i = GROUP_PRIORITY.indexOf(group);
    return i < 0 ? GROUP_PRIORITY.length : i;
  };

  matches.sort((a, b) => {
    const aStarts = a.text.toLowerCase().startsWith(q) ? 0 : 1;
    const bStarts = b.text.toLowerCase().startsWith(q) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    const groupDiff = rank(a.group) - rank(b.group);
    if (groupDiff !== 0) return groupDiff;
    return a.text.length - b.text.length;
  });

  return matches.slice(0, limit);
}

export function resetStatIndexForTests(): void {
  cache = null;
}

export function seedStatIndexForTests(index: StatIndex): void {
  cache = index;
}
