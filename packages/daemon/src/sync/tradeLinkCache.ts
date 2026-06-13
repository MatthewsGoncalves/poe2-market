import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TradeSearchOptions } from './tradeLink.js';

const CACHE_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../data/trade-link-cache.json',
);
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const STALE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  url: string;
  cachedAt: number;
}

interface CacheFile {
  entries: Record<string, CacheEntry>;
}

let memory: CacheFile = { entries: {} };
let loaded = false;
let persistQueue: Promise<void> = Promise.resolve();

export function cacheKey(
  league: string,
  itemName: string,
  options?: TradeSearchOptions,
): string {
  const parts = [
    'v2',
    league.trim(),
    itemName.trim(),
    options?.gemLevel ?? '',
    options?.gemQuality ?? '',
    options?.corrupted ?? '',
    options?.maxPriceChaos ?? '',
    ...(options?.mods ?? []).slice().sort().join('\0'),
  ];
  return parts.join('|');
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as CacheFile;
    if (parsed.entries && typeof parsed.entries === 'object') {
      memory = parsed;
    }
  } catch {
    memory = { entries: {} };
  }
}

function schedulePersist(): void {
  persistQueue = persistQueue.then(async () => {
    await mkdir(dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(memory, null, 2), 'utf8');
  });
}

function isFresh(entry: CacheEntry, now: number): boolean {
  return now - entry.cachedAt <= CACHE_TTL_MS;
}

function isUsableStale(entry: CacheEntry, now: number): boolean {
  return now - entry.cachedAt <= STALE_GRACE_MS;
}

export async function getCachedTradeUrl(key: string): Promise<string | null> {
  await ensureLoaded();
  const entry = memory.entries[key];
  if (!entry || !isFresh(entry, Date.now())) return null;
  return entry.url;
}

export async function getStaleCachedTradeUrl(key: string): Promise<string | null> {
  await ensureLoaded();
  const entry = memory.entries[key];
  if (!entry || !isUsableStale(entry, Date.now())) return null;
  return entry.url;
}

export async function setCachedTradeUrl(key: string, url: string): Promise<void> {
  await ensureLoaded();
  memory.entries[key] = { url, cachedAt: Date.now() };
  schedulePersist();
}

export function resetTradeLinkCacheForTests(): void {
  memory = { entries: {} };
  loaded = true;
  persistQueue = Promise.resolve();
}

export function seedTradeLinkCacheForTests(key: string, url: string, cachedAt = Date.now()): void {
  memory.entries[key] = { url, cachedAt };
  loaded = true;
}
