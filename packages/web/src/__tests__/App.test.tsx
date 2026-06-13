import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App } from '../App';

vi.mock('../api', () => ({
  fetchStatus: vi.fn(),
  fetchSnipes: vi.fn(),
  fetchCurrencyErrors: vi.fn(),
  evaluateItem: vi.fn(),
}));

import { fetchStatus, fetchSnipes, fetchCurrencyErrors } from '../api';

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading spinner before the first fetchStatus response resolves', () => {
    vi.mocked(fetchStatus).mockReturnValue(new Promise(() => {}));
    vi.mocked(fetchSnipes).mockResolvedValue({ results: [], generatedAt: '' });
    vi.mocked(fetchCurrencyErrors).mockResolvedValue({ alerts: [], generatedAt: '' });

    render(<App />);

    expect(screen.getByText('Loading market data…')).toBeTruthy();
  });

  it('shows an error banner when fetchStatus fails', async () => {
    vi.mocked(fetchStatus).mockRejectedValue(new Error('Network error'));
    vi.mocked(fetchSnipes).mockResolvedValue({ results: [], generatedAt: '' });
    vi.mocked(fetchCurrencyErrors).mockResolvedValue({ alerts: [], generatedAt: '' });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        'Could not reach daemon: Network error',
      );
    });
  });

  it('clears the error banner after a successful poll', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    vi.mocked(fetchStatus)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue({
        league: 'Return of the Ancients',
        lastSyncAt: '2026-06-09T14:32:00.000Z',
        itemCount: 42310,
        rates: { divineInChaos: 160, exaltedInChaos: 10 },
        stale: false,
      });
    vi.mocked(fetchSnipes).mockResolvedValue({ results: [], generatedAt: '' });
    vi.mocked(fetchCurrencyErrors).mockResolvedValue({ alerts: [], generatedAt: '' });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain(
        'Could not reach daemon: Network error',
      );
    });

    await vi.advanceTimersByTimeAsync(30_000);

    await waitFor(() => {
      expect(screen.queryByText(/Could not reach daemon/)).toBeNull();
    });
    expect(screen.getByText(/Return of the Ancients/)).toBeTruthy();

    vi.useRealTimers();
  });

  it('renders tab panels after fetchStatus resolves with data', async () => {
    vi.mocked(fetchStatus).mockResolvedValue({
      league: 'Return of the Ancients',
      lastSyncAt: '2026-06-09T14:32:00.000Z',
      itemCount: 42310,
      rates: { divineInChaos: 160, exaltedInChaos: 10 },
      stale: false,
    });
    vi.mocked(fetchSnipes).mockResolvedValue({ results: [], generatedAt: '' });
    vi.mocked(fetchCurrencyErrors).mockResolvedValue({ alerts: [], generatedAt: '' });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Return of the Ancients/)).toBeTruthy();
    });

    expect(screen.getByRole('tab', { name: /Snipes/i })).toBeTruthy();
    expect(screen.getByText('No opportunities found')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Erros de moeda/i }));
    expect(screen.getByText('No alerts')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Avaliador/i }));
    expect(screen.getByLabelText('Item name')).toBeTruthy();
  });
});
