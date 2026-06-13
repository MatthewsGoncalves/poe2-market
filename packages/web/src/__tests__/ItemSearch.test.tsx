import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ItemSearch } from '../components/ItemSearch';

vi.mock('../api', () => ({
  parseItem: vi.fn(),
  tradeSearch: vi.fn(),
  searchItemNames: vi.fn(async () => ({ results: [] })),
  searchStats: vi.fn(async () => ({ results: [] })),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { parseItem, tradeSearch } from '../api';

const PARSE_RESULT = {
  parsed: {
    rarity: 'Rare',
    itemClass: 'Belts',
    name: 'Doom Coil',
    baseType: 'Leather Belt',
    itemLevel: 80,
    corrupted: false,
    mods: [
      { raw: '+25 to maximum Life', values: [25] },
      { raw: 'Some Unknown Mod', values: [] },
    ],
  },
  matchedMods: [
    {
      index: 0,
      raw: '+25 to maximum Life',
      matched: true,
      statId: 'explicit.stat_life',
      statText: '# to maximum Life',
      group: 'explicit',
      value: 25,
    },
    { index: 1, raw: 'Some Unknown Mod', matched: false },
  ],
};

describe('ItemSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('open', vi.fn());
  });

  it('parses pasted text and shows matched/unmatched mods', async () => {
    vi.mocked(parseItem).mockResolvedValue(PARSE_RESULT as never);

    render(<ItemSearch league="TestLeague" />);
    fireEvent.change(screen.getByLabelText('Cole o item (Ctrl+C no jogo)'), {
      target: { value: 'pasted text' },
    });
    fireEvent.click(screen.getByText('Analisar item'));

    await waitFor(() => {
      expect(screen.getByText('# to maximum Life')).toBeTruthy();
      expect(screen.getByText('Some Unknown Mod')).toBeTruthy();
      expect(screen.getByText('1/2 mods reconhecidos')).toBeTruthy();
    });
  });

  it('sends selections to tradeSearch and opens the resolved url', async () => {
    vi.mocked(parseItem).mockResolvedValue(PARSE_RESULT as never);
    vi.mocked(tradeSearch).mockResolvedValue({
      url: 'https://www.pathofexile.com/trade2/search/poe2/TestLeague/abc',
      total: 5,
      parsed: PARSE_RESULT.parsed,
      matchedMods: PARSE_RESULT.matchedMods,
    } as never);

    render(<ItemSearch league="TestLeague" />);
    fireEvent.change(screen.getByLabelText('Cole o item (Ctrl+C no jogo)'), {
      target: { value: 'pasted text' },
    });
    fireEvent.click(screen.getByText('Analisar item'));

    await waitFor(() => screen.getByText('# to maximum Life'));

    fireEvent.click(screen.getByText('Abrir busca no trade'));

    await waitFor(() => {
      expect(tradeSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          league: 'TestLeague',
          itemText: 'pasted text',
          selections: { 0: { enabled: true, min: 25 }, 1: { enabled: false, min: undefined } },
        }),
      );
      expect(window.open).toHaveBeenCalledWith(
        'https://www.pathofexile.com/trade2/search/poe2/TestLeague/abc',
        '_blank',
        'noopener,noreferrer',
      );
      expect(screen.getByText(/5 resultados/)).toBeTruthy();
    });
  });

  it('shows a validation error when no text is pasted', () => {
    render(<ItemSearch league="TestLeague" />);
    fireEvent.click(screen.getByText('Analisar item'));
    expect(screen.getByRole('alert').textContent).toContain('Cole o texto do item');
    expect(parseItem).not.toHaveBeenCalled();
  });
});
