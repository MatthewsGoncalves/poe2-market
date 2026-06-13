import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarketLink } from '../components/MarketLink';

describe('MarketLink', () => {
  it('renders a link that opens the trade site via the daemon redirect', () => {
    render(<MarketLink league="Runes of Aldur" itemName="Headhunter" />);

    const link = screen.getByRole('link', { name: /Open Headhunter on trade site/i });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('href')).toMatch(
      /^http:\/\/localhost:3001\/api\/trade-link\?league=Runes\+of\+Aldur&name=Headhunter$/,
    );
  });
});
