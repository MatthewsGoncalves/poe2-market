import { describe, it, expect } from 'vitest';
import { buildTradeSearchUrl } from '../utils/tradeUrl';

describe('buildTradeSearchUrl', () => {
  it('builds a daemon trade-link URL with league and item name', () => {
    const url = buildTradeSearchUrl('Runes of Aldur', 'Headhunter');
    expect(url).toMatch(
      /^http:\/\/localhost:3001\/api\/trade-link\?league=Runes\+of\+Aldur&name=Headhunter$/,
    );
  });

  it('includes optional gem filters in the daemon URL', () => {
    const url = buildTradeSearchUrl('Runes of Aldur', 'Headhunter', {
      gemLevel: 21,
      corrupted: true,
    });
    expect(url).toContain('gemLevel=21');
    expect(url).toContain('corrupted=true');
  });

  it('includes mod lines and max price for filtered snipe links', () => {
    const url = buildTradeSearchUrl('Runes of Aldur', 'Headhunter', {
      mods: ['+25 to maximum Life'],
      maxPriceChaos: 520,
    });
    expect(url).toContain('maxPrice=520');
    expect(url).toContain('mods=%2B25+to+maximum+Life');
  });
});
