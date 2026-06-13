import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import type { MarketItem } from '../types.js';

const VALID_CONFIG = {
  league: 'Return of the Ancients',
  game: 'poe2',
  syncIntervalMs: 600000,
  snipeDiscountThreshold: 0.7,
  snipeMinValueChaos: 20,
  currencyErrorMinDivines: 1.5,
  currencyErrorTolerancePct: 0.2,
  daemonPort: 3001,
};

describe('loadConfig unit tests', () => {
  let tmpPath: string;

  beforeEach(() => {
    tmpPath = join(tmpdir(), `poe-test-config-${process.pid}-${Math.floor(Math.random() * 1e9)}.json`);
    delete process.env['PORT'];
    delete process.env['POEWATCH_BASE_URL'];
  });

  afterEach(() => {
    try { unlinkSync(tmpPath); } catch { /* already deleted */ }
    delete process.env['PORT'];
    delete process.env['POEWATCH_BASE_URL'];
  });

  it('returns a fully typed Config object with correct values', () => {
    writeFileSync(tmpPath, JSON.stringify(VALID_CONFIG));
    const config = loadConfig(tmpPath);
    expect(config.league).toBe('Return of the Ancients');
    expect(config.game).toBe('poe2');
    expect(config.syncIntervalMs).toBe(600000);
    expect(config.snipeDiscountThreshold).toBe(0.7);
    expect(config.snipeMinValueChaos).toBe(20);
    expect(config.currencyErrorMinDivines).toBe(1.5);
    expect(config.currencyErrorTolerancePct).toBe(0.2);
    expect(config.daemonPort).toBe(3001);
    expect(config.poewatchBaseUrl).toBe('https://api.poe.watch');
  });

  it('throws when league field is missing', () => {
    const { league: _omit, ...withoutLeague } = VALID_CONFIG;
    writeFileSync(tmpPath, JSON.stringify(withoutLeague));
    expect(() => loadConfig(tmpPath)).toThrow('"league"');
  });

  it('throws when syncIntervalMs is not a number', () => {
    writeFileSync(tmpPath, JSON.stringify({ ...VALID_CONFIG, syncIntervalMs: 'fast' }));
    expect(() => loadConfig(tmpPath)).toThrow('"syncIntervalMs"');
  });

  it('PORT env var overrides daemonPort', () => {
    process.env['PORT'] = '9999';
    writeFileSync(tmpPath, JSON.stringify(VALID_CONFIG));
    const config = loadConfig(tmpPath);
    expect(config.daemonPort).toBe(9999);
  });

  it('POEWATCH_BASE_URL env var overrides poewatchBaseUrl', () => {
    process.env['POEWATCH_BASE_URL'] = 'https://custom.poe.watch';
    writeFileSync(tmpPath, JSON.stringify(VALID_CONFIG));
    const config = loadConfig(tmpPath);
    expect(config.poewatchBaseUrl).toBe('https://custom.poe.watch');
  });

  it('throws on a non-existent config path', () => {
    expect(() => loadConfig('/nonexistent/path/config.json')).toThrow('Failed to read config.json');
  });

  it('throws when game field is missing', () => {
    const { game: _omit, ...withoutGame } = VALID_CONFIG;
    writeFileSync(tmpPath, JSON.stringify(withoutGame));
    expect(() => loadConfig(tmpPath)).toThrow('"game"');
  });

  it('throws when daemonPort is not a number', () => {
    writeFileSync(tmpPath, JSON.stringify({ ...VALID_CONFIG, daemonPort: 'three-thousand' }));
    expect(() => loadConfig(tmpPath)).toThrow('"daemonPort"');
  });

  it('throws when a string field has wrong type', () => {
    writeFileSync(tmpPath, JSON.stringify({ ...VALID_CONFIG, league: 42 }));
    expect(() => loadConfig(tmpPath)).toThrow('"league"');
  });

  it('throws when config.json is a JSON array instead of object', () => {
    writeFileSync(tmpPath, JSON.stringify([1, 2, 3]));
    expect(() => loadConfig(tmpPath)).toThrow('config.json must be a JSON object');
  });

  it('throws when PORT env var is not a valid integer', () => {
    process.env['PORT'] = 'notanumber';
    writeFileSync(tmpPath, JSON.stringify(VALID_CONFIG));
    expect(() => loadConfig(tmpPath)).toThrow('PORT env var must be a valid integer');
  });

  it('throws when a required number field is missing', () => {
    const { syncIntervalMs: _omit, ...withoutInterval } = VALID_CONFIG;
    writeFileSync(tmpPath, JSON.stringify(withoutInterval));
    expect(() => loadConfig(tmpPath)).toThrow('"syncIntervalMs"');
  });
});

describe('MarketItem optional fields', () => {
  it('allows all optional fields to be absent', () => {
    const item: MarketItem = {
      name: 'Chaos Orb',
      mean: 1,
      min: 1,
      lowConfidence: false,
    };
    expect(item.name).toBe('Chaos Orb');
    expect(item.linkCount).toBeUndefined();
    expect(item.gemLevel).toBeUndefined();
    expect(item.gemQuality).toBeUndefined();
    expect(item.gemIsCorrupted).toBeUndefined();
  });
});

const REPO_CONFIG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../config.json'
);

describe('loadConfig integration', () => {
  beforeEach(() => {
    delete process.env['PORT'];
    delete process.env['POEWATCH_BASE_URL'];
  });

  afterEach(() => {
    delete process.env['PORT'];
    delete process.env['POEWATCH_BASE_URL'];
  });

  it('reads the actual config.json at repo root and returns expected defaults', () => {
    const rawConfig = JSON.parse(readFileSync(REPO_CONFIG_PATH, 'utf-8')) as {
      league: string;
      game: string;
      syncIntervalMs: number;
      daemonPort: number;
    };

    const config = loadConfig();

    expect(config.league).toBe(rawConfig.league);
    expect(config.game).toBe(rawConfig.game);
    expect(config.syncIntervalMs).toBe(rawConfig.syncIntervalMs);
    expect(config.daemonPort).toBe(rawConfig.daemonPort);
    expect(config.poewatchBaseUrl).toBe('https://api.poe.watch');
  });
});
