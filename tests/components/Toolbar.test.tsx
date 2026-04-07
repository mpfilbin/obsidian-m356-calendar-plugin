import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toolbar } from '../../src/components/Toolbar';

const defaultProps = {
  currentDate: new Date(2026, 3, 1), // April 1, 2026 in local time
  view: 'month' as const,
  onViewChange: vi.fn(),
  onNavigate: vi.fn(),
  onRefresh: vi.fn(),
  onNewEvent: vi.fn(),
  syncing: false,
};

describe('Toolbar', () => {
  it('renders month and year label', () => {
    render(<Toolbar {...defaultProps} />);
    expect(screen.getByText(/April 2026/i)).toBeInTheDocument();
  });

  it('calls onNavigate("today") when Today is clicked', async () => {
    const onNavigate = vi.fn();
    render(<Toolbar {...defaultProps} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText('Today'));
    expect(onNavigate).toHaveBeenCalledWith('today');
  });

  it('calls onNavigate("prev") when ‹ is clicked', async () => {
    const onNavigate = vi.fn();
    render(<Toolbar {...defaultProps} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText('‹'));
    expect(onNavigate).toHaveBeenCalledWith('prev');
  });

  it('calls onNavigate("next") when › is clicked', async () => {
    const onNavigate = vi.fn();
    render(<Toolbar {...defaultProps} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText('›'));
    expect(onNavigate).toHaveBeenCalledWith('next');
  });

  it('calls onViewChange("week") when Week button is clicked', async () => {
    const onViewChange = vi.fn();
    render(<Toolbar {...defaultProps} onViewChange={onViewChange} />);
    await userEvent.click(screen.getByText('Week'));
    expect(onViewChange).toHaveBeenCalledWith('week');
  });

  it('disables refresh button and shows Syncing text when syncing', () => {
    render(<Toolbar {...defaultProps} syncing={true} />);
    const btn = screen.getByText(/Syncing/i);
    expect(btn).toBeDisabled();
  });

  it('applies "active" class to the current view button', () => {
    render(<Toolbar {...defaultProps} view="month" />);
    const monthBtn = screen.getByText('Month');
    expect(monthBtn).toHaveClass('active');
    expect(screen.getByText('Week')).not.toHaveClass('active');
  });

  it('calls onNewEvent when "+ New event" button is clicked', async () => {
    const onNewEvent = vi.fn();
    render(<Toolbar {...defaultProps} onNewEvent={onNewEvent} />);
    await userEvent.click(screen.getByText('+ New event'));
    expect(onNewEvent).toHaveBeenCalledTimes(1);
  });
});
