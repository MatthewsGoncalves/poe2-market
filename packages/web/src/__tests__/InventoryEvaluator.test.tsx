import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InventoryEvaluator } from '../components/InventoryEvaluator';

vi.mock('../api', () => ({
  evaluateItem: vi.fn(),
}));

import { evaluateItem } from '../api';

describe('InventoryEvaluator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not send corrupted when the checkbox is unchecked', async () => {
    vi.mocked(evaluateItem).mockResolvedValue({
      found: true,
      name: 'Shavronne\'s Wrappings',
      meanChaos: 100,
      minChaos: 90,
      meanDivine: 1,
      suggestedListPrice: 100,
      lowConfidence: false,
    });

    render(<InventoryEvaluator league="Runes of Aldur" displayCurrency="chaos" rates={{ divineInChaos: 160, exaltedInChaos: 10 }} />);

    fireEvent.change(screen.getByLabelText('Item name'), {
      target: { value: 'Shavronne\'s Wrappings' },
    });
    fireEvent.click(screen.getByText('Evaluate'));

    await waitFor(() => {
      expect(evaluateItem).toHaveBeenCalledWith({
        name: 'Shavronne\'s Wrappings',
        linkCount: undefined,
        gemLevel: undefined,
        gemQuality: undefined,
      });
    });
  });

  it('sends corrupted=true when the checkbox is checked', async () => {
    vi.mocked(evaluateItem).mockResolvedValue({
      found: true,
      name: 'Enlighten',
      meanChaos: 50,
      minChaos: 45,
      meanDivine: 0.5,
      suggestedListPrice: 50,
      lowConfidence: false,
    });

    render(<InventoryEvaluator league="Runes of Aldur" displayCurrency="chaos" rates={{ divineInChaos: 160, exaltedInChaos: 10 }} />);

    fireEvent.change(screen.getByLabelText('Item name'), {
      target: { value: 'Enlighten' },
    });
    fireEvent.click(screen.getByLabelText('Corrupted'));
    fireEvent.click(screen.getByText('Evaluate'));

    await waitFor(() => {
      expect(evaluateItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Enlighten', corrupted: true }),
      );
    });
  });

  it('calls evaluateItem with the correct name and linkCount when the form is submitted', async () => {
    vi.mocked(evaluateItem).mockResolvedValue({
      found: true,
      name: 'Headhunter',
      meanChaos: 2000,
      minChaos: 1800,
      meanDivine: 12.5,
      suggestedListPrice: 2000,
      lowConfidence: false,
    });

    render(<InventoryEvaluator league="Runes of Aldur" displayCurrency="chaos" rates={{ divineInChaos: 160, exaltedInChaos: 10 }} />);

    fireEvent.change(screen.getByLabelText('Item name'), {
      target: { value: 'Headhunter' },
    });
    fireEvent.change(screen.getByLabelText('Link count'), {
      target: { value: '6' },
    });
    fireEvent.click(screen.getByText('Evaluate'));

    await waitFor(() => {
      expect(evaluateItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Headhunter', linkCount: 6 }),
      );
    });
  });

  it('shows a low-confidence warning when the response has lowConfidence: true', async () => {
    vi.mocked(evaluateItem).mockResolvedValue({
      found: true,
      name: 'Rare Synthesised Jewel',
      meanChaos: 5,
      minChaos: 2,
      meanDivine: 0.03,
      suggestedListPrice: 5,
      lowConfidence: true,
    });

    render(<InventoryEvaluator league="Runes of Aldur" displayCurrency="chaos" rates={{ divineInChaos: 160, exaltedInChaos: 10 }} />);

    fireEvent.change(screen.getByLabelText('Item name'), {
      target: { value: 'Rare Synthesised Jewel' },
    });
    fireEvent.click(screen.getByText('Evaluate'));

    await waitFor(() => {
      expect(
        screen.getByRole('alert').textContent,
      ).toBe('Low confidence — few active listings. Do not rely on this price for resale.');
    });
  });

  it('displays prices from the evaluateItem response in the selected currency', async () => {
    vi.mocked(evaluateItem).mockResolvedValue({
      found: true,
      name: 'Headhunter',
      meanChaos: 2000,
      minChaos: 1800,
      meanDivine: 12.5,
      suggestedListPrice: 2000,
      lowConfidence: false,
    });

    render(<InventoryEvaluator league="Runes of Aldur" displayCurrency="chaos" rates={{ divineInChaos: 160, exaltedInChaos: 10 }} />);

    fireEvent.change(screen.getByLabelText('Item name'), {
      target: { value: 'Headhunter' },
    });
    fireEvent.click(screen.getByText('Evaluate'));

    await waitFor(() => {
      const stats = screen.getAllByText(/^Mean:/);
      expect(stats[0].textContent).toMatch(/2[,.]?000/);
      expect(screen.getByText(/^Min:/).textContent).toMatch(/1[,.]?800/);
      expect(screen.getByText(/^Suggested list price:/).textContent).toMatch(/2[,.]?000/);
    });
  });

  it('shows a validation error when the item name is empty', async () => {
    render(<InventoryEvaluator league="Runes of Aldur" displayCurrency="chaos" rates={{ divineInChaos: 160, exaltedInChaos: 10 }} />);

    fireEvent.click(screen.getByText('Evaluate'));

    expect(screen.getByRole('alert').textContent).toBe('Item name is required');
    expect(evaluateItem).not.toHaveBeenCalled();
  });

  it('displays an error message when evaluateItem throws', async () => {
    vi.mocked(evaluateItem).mockRejectedValue(new Error('Internal Server Error'));

    render(<InventoryEvaluator league="Runes of Aldur" displayCurrency="chaos" rates={{ divineInChaos: 160, exaltedInChaos: 10 }} />);

    fireEvent.change(screen.getByLabelText('Item name'), {
      target: { value: 'Headhunter' },
    });
    fireEvent.click(screen.getByText('Evaluate'));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('Internal Server Error');
    });
  });

  it('displays "Item not found" when the response has found: false', async () => {
    vi.mocked(evaluateItem).mockResolvedValue({
      found: false,
      name: 'Unknown Item',
    });

    render(<InventoryEvaluator league="Runes of Aldur" displayCurrency="chaos" rates={{ divineInChaos: 160, exaltedInChaos: 10 }} />);

    fireEvent.change(screen.getByLabelText('Item name'), {
      target: { value: 'Unknown Item' },
    });
    fireEvent.click(screen.getByText('Evaluate'));

    await waitFor(() => {
      expect(screen.getByText('Item not found')).toBeTruthy();
    });
  });
});
