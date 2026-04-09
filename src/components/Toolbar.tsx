import React from 'react';

type ViewType = 'month' | 'week';

interface ToolbarProps {
  currentDate: Date;
  view: ViewType;
  onViewChange: (view: ViewType) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onRefresh: () => void;
  onNewEvent: () => void;
  syncing: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentDate,
  view,
  onViewChange,
  onNavigate,
  onRefresh,
  onNewEvent,
  syncing,
}) => {
  const label =
    view === 'month'
      ? currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : `Week of ${currentDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

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
        <button className="m365-new-event-btn" onClick={onNewEvent}>
          + New event
        </button>
        <button
          className="m365-calendar-refresh"
          onClick={onRefresh}
          disabled={syncing}
        >
          {syncing ? '↻ Syncing…' : '↻'}
        </button>
      </div>
    </div>
  );
};
