import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from '../components/Pagination';

describe('Pagination', () => {
  it('renders nothing when there is only one page', () => {
    const { container } = render(
      <Pagination
        page={1}
        totalPages={1}
        total={5}
        pageSize={10}
        onPageChange={() => {}}
        label="Test list"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onPageChange when next is clicked', () => {
    let page = 1;
    render(
      <Pagination
        page={page}
        totalPages={3}
        total={25}
        pageSize={10}
        onPageChange={(next) => {
          page = next;
        }}
        label="Test list"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(page).toBe(2);
  });
});
