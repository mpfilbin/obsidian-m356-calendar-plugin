import { App, Modal } from 'obsidian';
import React, { StrictMode, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { M365Calendar, NewEventInput } from '../types';

interface CreateEventFormProps {
  calendars: M365Calendar[];
  defaultCalendarId: string;
  initialDate: Date;
  onSubmit: (calendarId: string, event: NewEventInput) => void;
  onCancel: () => void;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateTimeLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

  const [startStr, setStartStr] = useState(toDateTimeLocal(defaultStart));
  const [endStr, setEndStr] = useState(toDateTimeLocal(defaultEnd));
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

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
    if (end <= start) {
      setError('End time must be after start time');
      return;
    }
    onSubmit(calendarId, {
      subject: subject.trim(),
      start,
      end,
      description: description.trim() || undefined,
    });
  };

  return (
    <div className="m365-create-event-form">
      {error && <div className="m365-form-error">{error}</div>}
      <div className="m365-form-field">
        <label>Title</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Event title"
          autoFocus
        />
      </div>
      <div className="m365-form-field">
        <label>Calendar</label>
        <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="m365-form-field">
        <label>Start</label>
        <input
          type="datetime-local"
          value={startStr}
          onChange={(e) => setStartStr(e.target.value)}
        />
      </div>
      <div className="m365-form-field">
        <label>End</label>
        <input
          type="datetime-local"
          value={endStr}
          onChange={(e) => setEndStr(e.target.value)}
        />
      </div>
      <div className="m365-form-field">
        <label>Description (optional)</label>
        <textarea
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
    this.titleEl.setText('New Event');
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
