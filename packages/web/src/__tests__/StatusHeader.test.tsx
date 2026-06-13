import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusHeader } from '../components/StatusHeader';
import type { StatusResponse } from '../api';

const baseStatus: StatusResponse = {
  league: 'Return of the Ancients',
  lastSyncAt: '2026-06-09T14:32:00.000Z',
  itemCount: 42310,
  rates: { divineInChaos: 160, exaltedInChaos: 10 },
  stale: false,
};

describe('StatusHeader', () => {
  it('renders the league name and last sync time from a mocked status response', () => {
    render(<StatusHeader status={baseStatus} displayCurrency="chaos" />);
    expect(screen.getByText(/Return of the Ancients/)).toBeTruthy();
    expect(screen.getByText(/Last sync/)).toBeTruthy();
  });

  it('renders the stale-data warning banner when status.stale is true', () => {
    render(<StatusHeader status={{ ...baseStatus, stale: true }} displayCurrency="chaos" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Stale data/)).toBeTruthy();
  });

  it('does NOT render the stale warning when status.stale is false', () => {
    render(<StatusHeader status={{ ...baseStatus, stale: false }} displayCurrency="chaos" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/Stale data/)).toBeNull();
  });

  it('shows placeholder instead of Invalid Date when lastSyncAt is empty', () => {
    render(<StatusHeader status={{ ...baseStatus, lastSyncAt: '' }} displayCurrency="chaos" />);
    expect(screen.getByText(/Waiting for first sync/)).toBeTruthy();
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
  });

  it('shows placeholder in stale banner when lastSyncAt is empty', () => {
    render(
      <StatusHeader
        status={{ ...baseStatus, stale: true, lastSyncAt: '' }}
        displayCurrency="chaos"
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/Waiting for first sync/);
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
  });
});
