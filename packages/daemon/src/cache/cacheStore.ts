import { promises as fsp } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketItem, ExchangeRates, CacheState } from '../types.js';

const DEFAULT_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../data');

const EMPTY_RATES: ExchangeRates = { divineInChaos: 160, exaltedInChaos: 10 };

export class CacheStore {
  private items: MarketItem[] = [];
  private rates: ExchangeRates = { ...EMPTY_RATES };
  private lastSyncAt = '';
  private league: string;
  private nameIndex = new Map<string, MarketItem[]>();
  private readonly dataDir: string;

  constructor(league: string, dataDir?: string) {
    this.league = league;
    this.dataDir = dataDir ?? process.env['DATA_DIR'] ?? DEFAULT_DATA_DIR;
  }

  private get cacheFilePath(): string {
    return join(this.dataDir, 'cache.json');
  }

  private get cacheTmpPath(): string {
    return join(this.dataDir, 'cache.json.tmp');
  }

  private rebuildIndex(): void {
    this.nameIndex = new Map();
    for (const item of this.items) {
      const bucket = this.nameIndex.get(item.name);
      if (bucket) {
        bucket.push(item);
      } else {
        this.nameIndex.set(item.name, [item]);
      }
    }
  }

  update(items: MarketItem[], rates: ExchangeRates, league: string): void {
    this.items = [...items];
    this.rates = { ...rates };
    this.league = league;
    this.lastSyncAt = new Date().toISOString();
    this.rebuildIndex();
  }

  getAll(): MarketItem[] {
    return this.items;
  }

  getByName(name: string): MarketItem[] {
    return this.nameIndex.get(name) ?? [];
  }

  getState(): CacheState {
    return {
      items: this.items,
      rates: { ...this.rates },
      lastSyncAt: this.lastSyncAt,
      league: this.league,
    };
  }

  async loadFromDisk(expectedLeague: string): Promise<void> {
    let content: string;
    try {
      content = await fsp.readFile(this.cacheFilePath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw err;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.warn('[WARN] cache.json contains invalid JSON — starting with empty state');
      return;
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      !Array.isArray((parsed as Partial<CacheState>).items)
    ) {
      console.warn('[WARN] cache.json has unexpected structure — starting with empty state');
      return;
    }

    const state = parsed as CacheState;
    if (state.league && state.league !== expectedLeague) {
      console.warn('[WARN] cache.json league mismatch — ignoring stale cache', {
        cacheLeague: state.league,
        expectedLeague,
      });
      return;
    }

    this.items = state.items;
    this.rates = state.rates ?? { ...EMPTY_RATES };
    this.lastSyncAt = state.lastSyncAt ?? '';
    this.league = state.league ?? this.league;
    this.rebuildIndex();
  }

  async saveToDisk(): Promise<void> {
    await fsp.mkdir(this.dataDir, { recursive: true });
    const json = JSON.stringify(this.getState(), null, 2);
    await fsp.writeFile(this.cacheTmpPath, json, 'utf-8');
    await fsp.rename(this.cacheTmpPath, this.cacheFilePath);
    console.info(`[INFO] Cache written to disk: ${this.cacheFilePath}`);
  }
}
