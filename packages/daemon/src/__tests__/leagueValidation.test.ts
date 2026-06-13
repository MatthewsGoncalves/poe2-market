import { describe, it, expect, vi } from 'vitest';
import { assertLeagueSupported, poewatchLeagueId } from '../sync/leagueValidation.js';
import type { Config } from '../config.js';

vi.mock('../sync/poewatchClient.js', () => ({
  fetchLeagues: vi.fn(),
}));

import { fetchLeagues } from '../sync/poewatchClient.js';

const BASE_CONFIG: Config = {
  league: 'Runes of Aldur',
  expansionName: 'Return of the Ancients',
  poewatchLeague: 'Mirage',
  game: 'poe2',
  syncIntervalMs: 600000,
  snipeDiscountThreshold: 0.70,
  snipeMinValueChaos: 20,
  currencyErrorMinDivines: 1.5,
  currencyErrorTolerancePct: 0.20,
  daemonPort: 3001,
  poewatchBaseUrl: 'https://api.poe.watch',
};

describe('poewatchLeagueId()', () => {
  it('returns poewatchLeague override when set', () => {
    expect(poewatchLeagueId(BASE_CONFIG)).toBe('Mirage');
  });

  it('falls back to league when override is omitted', () => {
    const { poewatchLeague: _omit, ...config } = BASE_CONFIG;
    expect(poewatchLeagueId(config)).toBe('Runes of Aldur');
  });
});

describe('assertLeagueSupported()', () => {
  it('accepts poewatchLeague override when listed on poe.watch', async () => {
    vi.mocked(fetchLeagues).mockResolvedValue(['Mirage', 'Standard']);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(assertLeagueSupported(BASE_CONFIG)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('rejects when poewatch league id is not on poe.watch', async () => {
    vi.mocked(fetchLeagues).mockResolvedValue(['Mirage']);
    await expect(
      assertLeagueSupported({ ...BASE_CONFIG, poewatchLeague: 'Runes of Aldur' }),
    ).rejects.toThrow(/not available on poe.watch/);
  });
});
