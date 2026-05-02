import React from 'react';
import type { ViewType } from '../types';

interface ToolbarProps {
  currentDate: Date;
  view: ViewType;
  onViewChange: (view: ViewType) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onRefresh: () => void;
  onNewEvent: () => void;
  onNewTask: () => void;
  syncing: boolean;
  refreshFailed: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentDate,
  view,
  onViewChange,
  onNavigate,
  onRefresh,
  onNewEvent,
  onNewTask,
  syncing,
  refreshFailed,
}) => {
  const label =
    view === 'month'
      ? currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : view === 'week'
      ? `Week of ${currentDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
      : currentDate.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });

  const refreshLabel = syncing ? '↻ Syncing…' : refreshFailed ? '⚠ ↻' : '↻';
  const refreshTitle = refreshFailed ? 'Last refresh failed — click to retry' : undefined;

  return (
    <div className="m365-calendar-toolbar">
      <div className="m365-calendar-nav">
        <button onClick={() => onNavigate('prev')}>‹</button>
        <button onClick={() => onNavigate('today')}>Today</button>
        <button onClick={() => onNavigate('next')}>›</button>
        <span className="m365-calendar-date-label">{label}</span>
      </div>
      <div className="m365-calendar-view-toggle">
        <button
          className={view === 'month' ? 'active' : ''}
          onClick={() => onViewChange('month')}
        >
          Month
        </button>
        <button
          className={view === 'week' ? 'active' : ''}
          onClick={() => onViewChange('week')}
        >
          Week
        </button>
      </div>
      <div className="m365-toolbar-actions">
        <button className="m365-new-task-btn" onClick={onNewTask}>
          + New task
        </button>
        <button className="m365-new-event-btn" onClick={onNewEvent}>
          + New event
        </button>
        <button
          className={`m365-calendar-refresh${refreshFailed ? ' m365-refresh-failed' : ''}`}
          onClick={onRefresh}
          disabled={syncing}
          title={refreshTitle}
        >
          {refreshLabel}
        </button>
      </div>
    </div>
  );
};
