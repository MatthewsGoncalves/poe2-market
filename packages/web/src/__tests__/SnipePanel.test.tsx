import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SnipePanel } from '../components/SnipePanel';
import type { SnipeResult } from '../api';

const RATES = { divineInChaos: 160, exaltedInChaos: 10 };
const panelProps = {
  league: 'Runes of Aldur',
  displayCurrency: 'chaos' as const,
  rates: RATES,
};

const mockSnipes: SnipeResult[] = [
  {
    name: "Shavronne's Wrappings",
    linkCount: 6,
    meanChaos: 800,
    minChaos: 520,
    profitChaos: 280,
    discountPct: 35,
  },
];

function makeSnipes(count: number): SnipeResult[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Item ${i + 1}`,
    linkCount: 0,
    meanChaos: 100,
    minChaos: 50,
    profitChaos: 50,
    discountPct: 50,
  }));
}

describe('SnipePanel', () => {
  it('renders a row for each item with name, profitChaos, discountPct visible', () => {
    render(<SnipePanel snipes={mockSnipes} {...panelProps} />);
    expect(screen.getByText("Shavronne's Wrappings")).toBeTruthy();
    expect(screen.getByText('280')).toBeTruthy();
    expect(screen.getByText('35%')).toBeTruthy();
  });

  it('renders "No opportunities found" when the response is an empty array', () => {
    render(<SnipePanel snipes={[]} {...panelProps} />);
    expect(screen.getByText('No opportunities found')).toBeTruthy();
  });

  it('renders distinct rows when items share the same name and linkCount', () => {
    const duplicateKeySnipes: SnipeResult[] = [
      {
        name: 'Chaos Orb',
        linkCount: 0,
        meanChaos: 1,
        minChaos: 0.8,
        profitChaos: 0.2,
        discountPct: 20,
      },
      {
        name: 'Chaos Orb',
        linkCount: 0,
        meanChaos: 1,
        minChaos: 0.5,
        profitChaos: 0.5,
        discountPct: 50,
      },
    ];

    render(<SnipePanel snipes={duplicateKeySnipes} {...panelProps} />);

    expect(screen.getAllByText('Chaos Orb')).toHaveLength(2);
    expect(screen.getByText('20%')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
  });

  it('paginates snipes and shows the next page on click', () => {
    render(<SnipePanel snipes={makeSnipes(15)} {...panelProps} />);

    expect(screen.getByText('Item 1')).toBeTruthy();
    expect(screen.getByText('Item 10')).toBeTruthy();
    expect(screen.queryByText('Item 11')).toBeNull();
    expect(screen.getByText('1–10 of 15')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.queryByText('Item 1')).toBeNull();
    expect(screen.getByText('Item 11')).toBeTruthy();
    expect(screen.getByText('Item 15')).toBeTruthy();
    expect(screen.getByText('11–15 of 15')).toBeTruthy();
  });
});
