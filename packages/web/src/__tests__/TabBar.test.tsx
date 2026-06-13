import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabBar } from '../components/TabBar';

describe('TabBar', () => {
  it('calls onChange when a tab is clicked', () => {
    const onChange = vi.fn();
    render(
      <TabBar
        tabs={[
          { id: 'snipes', label: 'Snipes', badge: 3 },
          { id: 'mistakes', label: 'Erros de moeda' },
          { id: 'evaluator', label: 'Avaliador' },
        ]}
        active="snipes"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /Erros de moeda/i }));
    expect(onChange).toHaveBeenCalledWith('mistakes');
  });

  it('marks the active tab with aria-selected', () => {
    render(
      <TabBar
        tabs={[
          { id: 'snipes', label: 'Snipes' },
          { id: 'mistakes', label: 'Erros de moeda' },
        ]}
        active="mistakes"
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole('tab', { name: /Snipes/i }).getAttribute('aria-selected')).toBe(
      'false',
    );
    expect(screen.getByRole('tab', { name: /Erros de moeda/i }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});
