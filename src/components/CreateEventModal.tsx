import { App, Modal } from 'obsidian';
import React, { StrictMode, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { M365Calendar, NewEventInput } from '../types';
import { toDateOnly, toDateTimeLocal } from '../lib/datetime';

interface CreateEventFormProps {
  calendars: M365Calendar[];
  defaultCalendarId: string;
  initialDate: Date;
  onSubmit: (calendarId: string, event: NewEventInput) => void;
  onCancel: () => void;
}

export const CreateEventForm: React.FC<CreateEventFormProps> = ({
  calendars,
  defaultCalendarId,
  initialDate,
  onSubmit,
  onCancel,
}) => {
  const [subject, setSubject] = useState('');
  const [calendarId, setCalendarId] = useState(
    defaultCalendarId || calendars[0]?.id || '',
  );
  const defaultStart = new Date(initialDate);
  defaultStart.setHours(9, 0, 0, 0);
  const defaultEnd = new Date(initialDate);
  defaultEnd.setHours(10, 0, 0, 0);

  const [isAllDay, setIsAllDay] = useState(false);
  const [startStr, setStartStr] = useState(toDateTimeLocal(defaultStart));
  const [endStr, setEndStr] = useState(toDateTimeLocal(defaultEnd));
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const handleAllDayChange = (checked: boolean) => {
    setIsAllDay(checked);
    // Date-only strings ("YYYY-MM-DD") are parsed as UTC midnight by spec; append
    // T00:00 to force local-midnight parsing so toggling back to timed preserves the
    // correct local date rather than shifting to the previous day in negative-offset zones.
    const parseStr = (s: string): Date => new Date(s.length === 10 ? `${s}T00:00` : s);
    const s = parseStr(startStr);
    const e = parseStr(endStr);
    const safeStart = isNaN(s.getTime()) ? defaultStart : s;
    const safeEnd = isNaN(e.getTime()) ? defaultEnd : e;
    if (checked) {
      const startDateStr = toDateOnly(safeStart);
      let endDateStr = toDateOnly(safeEnd);
      if (endDateStr <= startDateStr) {
        const nextDay = new Date(safeStart);
        nextDay.setDate(nextDay.getDate() + 1);
        endDateStr = toDateOnly(nextDay);
      }
      setStartStr(startDateStr);
      setEndStr(endDateStr);
    } else {
      setStartStr(toDateTimeLocal(safeStart));
      setEndStr(toDateTimeLocal(safeEnd));
    }
  };

  const handleSubmit = () => {
    if (!subject.trim()) {
      setError('Title is required');
      return;
    }
    if (!calendarId) {
      setError('Please select a calendar');
      return;
    }
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isAllDay) {
      if (endStr <= startStr) {
        setError('For all-day events, the end date must be after the start date');
        return;
      }
    } else if (end <= start) {
      setError('End time must be after start time');
      return;
    }
    onSubmit(calendarId, {
      subject: subject.trim(),
      start,
      end,
      isAllDay,
      description: description.trim() || undefined,
    });
  };

  return (
    <div className="m365-create-event-form">
      {error && <div className="m365-form-error">{error}</div>}
      <div className="m365-form-field">
        <label htmlFor="m365-create-subject">Title</label>
        <input
          id="m365-create-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Event title"
          autoFocus
        />
      </div>
      <div className="m365-form-field">
        <label htmlFor="m365-create-calendar">Calendar</label>
        <select id="m365-create-calendar" value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="m365-form-checkbox">
        <label>
          <input
            type="checkbox"
            checked={isAllDay}
            onChange={(e) => handleAllDayChange(e.target.checked)}
          />
          All day
        </label>
      </div>
      <div className="m365-form-field">
        <label htmlFor="m365-create-start">Start</label>
        <input
          id="m365-create-start"
          type={isAllDay ? 'date' : 'datetime-local'}
          value={startStr}
          onChange={(e) => setStartStr(e.target.value)}
        />
      </div>
      <div className="m365-form-field">
        <label htmlFor="m365-create-end">End</label>
        <input
          id="m365-create-end"
          type={isAllDay ? 'date' : 'datetime-local'}
          value={endStr}
          onChange={(e) => setEndStr(e.target.value)}
        />
      </div>
      <div className="m365-form-field">
        <label htmlFor="m365-create-description">Description (optional)</label>
        <textarea
          id="m365-create-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      <div className="m365-form-actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="mod-cta" onClick={handleSubmit}>
          Create
        </button>
      </div>
    </div>
  );
};

export class CreateEventModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private readonly calendars: M365Calendar[],
    private readonly defaultCalendarId: string,
    private readonly initialDate: Date,
    private readonly onSubmit: (
      calendarId: string,
      event: NewEventInput,
    ) => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('New event');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <StrictMode>
        <CreateEventForm
          calendars={this.calendars}
          defaultCalendarId={this.defaultCalendarId}
          initialDate={this.initialDate}
          onSubmit={async (calendarId, event) => {
            await this.onSubmit(calendarId, event);
            this.close();
          }}
          onCancel={() => this.close()}
        />
      </StrictMode>,
    );
  }

  onClose(): void {
    this.root?.unmount();
  }
}
