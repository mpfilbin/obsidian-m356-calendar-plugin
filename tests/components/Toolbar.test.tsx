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
  onNewTask: vi.fn(),
  syncing: false,
  refreshFailed: false,
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

  it('calls onNewTask when "+ New task" button is clicked', async () => {
    const onNewTask = vi.fn();
    render(<Toolbar {...defaultProps} onNewTask={onNewTask} />);
    await userEvent.click(screen.getByText('+ New task'));
    expect(onNewTask).toHaveBeenCalledTimes(1);
  });

  it('shows full date label in day view', () => {
    render(<Toolbar {...defaultProps} view="day" currentDate={new Date(2026, 3, 9)} />);
    expect(screen.getByText(/April 9.*2026/i)).toBeInTheDocument();
  });

  it('shows ⚠ ↻ with m365-refresh-failed class and retry title when refreshFailed is true', () => {
    render(<Toolbar {...defaultProps} refreshFailed={true} />);
    const btn = screen.getByTitle('Last refresh failed — click to retry');
    expect(btn).toHaveTextContent('⚠ ↻');
    expect(btn).toHaveClass('m365-refresh-failed');
    expect(btn).toHaveAttribute('title', 'Last refresh failed — click to retry');
  });
});
