import { describe, it, expect } from 'vitest';
import { buildTradeSearchUrl } from '../utils/tradeUrl';

describe('buildTradeSearchUrl', () => {
  it('builds a trade2 URL with league and encoded query', () => {
    const url = buildTradeSearchUrl('Runes of Aldur', 'Headhunter');
    expect(url).toMatch(/^https:\/\/www\.pathofexile\.com\/trade2\/search\/poe2\/Runes\+of\+Aldur\?q=/);
    expect(decodeURIComponent(url.split('?q=')[1] ?? '')).toContain('"name":"Headhunter"');
  });

  it('encodes league names with spaces using plus signs', () => {
    const url = buildTradeSearchUrl('Hardcore Mirage', 'Headhunter');
    expect(url).toContain('/Hardcore+Mirage?');
  });
});
