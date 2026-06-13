import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CurrencyErrorPanel } from '../components/CurrencyErrorPanel';
import type { CurrencyErrorResult } from '../api';

const RATES = { divineInChaos: 160, exaltedInChaos: 10 };
const panelProps = {
  league: 'Runes of Aldur',
  displayCurrency: 'chaos' as const,
  rates: RATES,
};

const mockAlerts: CurrencyErrorResult[] = [
  {
    name: 'Headhunter',
    expectedAmount: 12.5,
    expectedCurrency: 'divine',
    listedMinChaos: 125,
    listedAsAmount: 12.5,
    mistakenCurrency: 'exalted',
  },
];

describe('CurrencyErrorPanel', () => {
  it('renders an alert for each item in a mocked fetchCurrencyErrors response', () => {
    render(<CurrencyErrorPanel alerts={mockAlerts} {...panelProps} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Headhunter/)).toBeTruthy();
  });

  it('renders "No alerts" when the response is empty', () => {
    render(<CurrencyErrorPanel alerts={[]} {...panelProps} />);
    expect(screen.getByText('No alerts')).toBeTruthy();
  });

  it('renders distinct alerts when the same item name appears more than once', () => {
    const duplicateNameAlerts: CurrencyErrorResult[] = [
      {
        name: 'Headhunter',
        expectedAmount: 12.5,
        expectedCurrency: 'divine',
        listedMinChaos: 125,
        listedAsAmount: 12.5,
        mistakenCurrency: 'exalted',
      },
      {
        name: 'Headhunter',
        expectedAmount: 13,
        expectedCurrency: 'divine',
        listedMinChaos: 130,
        listedAsAmount: 13,
        mistakenCurrency: 'exalted',
      },
    ];

    render(<CurrencyErrorPanel alerts={duplicateNameAlerts} {...panelProps} />);

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(alerts[0].textContent).toContain('125');
    expect(alerts[1].textContent).toContain('130');
  });
});
