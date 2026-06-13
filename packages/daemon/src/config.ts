import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

export interface Config {
  league: string;
  game: string;
  syncIntervalMs: number;
  snipeDiscountThreshold: number;
  snipeMinValueChaos: number;
  currencyErrorMinDivines: number;
  currencyErrorTolerancePct: number;
  daemonPort: number;
  poewatchBaseUrl: string;
  /** Expansion / patch name shown in the UI (e.g. Return of the Ancients). */
  expansionName?: string;
  /**
   * poe.watch API league id when it differs from `league` (legacy mislabel).
   * PoE 2 trade uses Runes of Aldur; poe.watch still serves prices under Mirage.
   */
  poewatchLeague?: string;
}

const DEFAULT_CONFIG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../config.json'
);

const DEFAULT_POEWATCH_BASE_URL = 'https://api.poe.watch';

function requireString(obj: Record<string, unknown>, key: string): string {
  const val = obj[key];
  if (val === undefined || val === null) {
    throw new Error(`config.json is missing required field: "${key}"`);
  }
  if (typeof val !== 'string') {
    throw new Error(`config.json field "${key}" must be a string, got ${typeof val}`);
  }
  return val;
}

function requireNumber(obj: Record<string, unknown>, key: string): number {
  const val = obj[key];
  if (val === undefined || val === null) {
    throw new Error(`config.json is missing required field: "${key}"`);
  }
  if (typeof val !== 'number') {
    throw new Error(`config.json field "${key}" must be a number, got ${typeof val}`);
  }
  return val;
}

export function loadConfig(configPath?: string): Config {
  const resolvedPath = configPath ?? DEFAULT_CONFIG_PATH;

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolvedPath, 'utf-8'));
  } catch (e) {
    throw new Error(
      `Failed to read config.json at ${resolvedPath}: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('config.json must be a JSON object');
  }

  const obj = raw as Record<string, unknown>;

  const config: Config = {
    league: requireString(obj, 'league'),
    game: requireString(obj, 'game'),
    syncIntervalMs: requireNumber(obj, 'syncIntervalMs'),
    snipeDiscountThreshold: requireNumber(obj, 'snipeDiscountThreshold'),
    snipeMinValueChaos: requireNumber(obj, 'snipeMinValueChaos'),
    currencyErrorMinDivines: requireNumber(obj, 'currencyErrorMinDivines'),
    currencyErrorTolerancePct: requireNumber(obj, 'currencyErrorTolerancePct'),
    daemonPort: requireNumber(obj, 'daemonPort'),
    poewatchBaseUrl: DEFAULT_POEWATCH_BASE_URL,
  };

  const expansionName = obj['expansionName'];
  if (expansionName !== undefined) {
    if (typeof expansionName !== 'string') {
      throw new Error(
        `config.json field "expansionName" must be a string, got ${typeof expansionName}`,
      );
    }
    config.expansionName = expansionName;
  }

  const poewatchLeague = obj['poewatchLeague'];
  if (poewatchLeague !== undefined) {
    if (typeof poewatchLeague !== 'string') {
      throw new Error(
        `config.json field "poewatchLeague" must be a string, got ${typeof poewatchLeague}`,
      );
    }
    config.poewatchLeague = poewatchLeague;
  }

  if (process.env['PORT'] !== undefined) {
    const port = parseInt(process.env['PORT'], 10);
    if (isNaN(port)) {
      throw new Error(`PORT env var must be a valid integer, got "${process.env['PORT']}"`);
    }
    config.daemonPort = port;
  }

  if (process.env['POEWATCH_BASE_URL'] !== undefined) {
    config.poewatchBaseUrl = process.env['POEWATCH_BASE_URL'];
  }

  return config;
}
