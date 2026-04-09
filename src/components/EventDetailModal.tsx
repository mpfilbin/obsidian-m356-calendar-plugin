import { App, Modal } from 'obsidian';
import React, { StrictMode, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { M365Event, EventPatch } from '../types';
import { toDateOnly, toDateTimeLocal } from '../lib/datetime';

// ── Form ─────────────────────────────────────────────────────────────────────

interface EventDetailFormProps {
  event: M365Event;
  onSave: (patch: EventPatch) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}

export const EventDetailForm: React.FC<EventDetailFormProps> = ({
  event,
  onSave,
  onCancel,
  onDelete,
}) => {
  const startDate = new Date(event.start.dateTime);
  const endDate = new Date(event.end.dateTime);

  const [subject, setSubject] = useState(event.subject);
  const [location, setLocation] = useState(event.location ?? '');
  const [isAllDay, setIsAllDay] = useState(event.isAllDay);
  const [startStr, setStartStr] = useState(
    event.isAllDay ? toDateOnly(startDate) : toDateTimeLocal(startDate),
  );
  const [endStr, setEndStr] = useState(
    event.isAllDay ? toDateOnly(endDate) : toDateTimeLocal(endDate),
  );
  const [description, setDescription] = useState(event.bodyPreview ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleAllDayChange = (checked: boolean) => {
    setIsAllDay(checked);
    const parseStr = (s: string): Date => new Date(s.length === 10 ? `${s}T00:00` : s);
    const s = parseStr(startStr);
    const e = parseStr(endStr);
    const safeStart = isNaN(s.getTime()) ? startDate : s;
    const safeEnd = isNaN(e.getTime()) ? endDate : e;
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

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await onDelete!();
    } catch (e) {
      console.error('M365 Calendar:', e);
      setError(e instanceof Error ? e.message : 'Failed to delete event');
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    if (!subject.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Send the raw datetime string (without UTC conversion) paired with the
      // event's original timezone so Graph interprets the wall-clock time correctly.
      // datetime-local values are "YYYY-MM-DDTHH:MM" — append seconds for Graph.
      // date-only values (all-day) are "YYYY-MM-DD" — append midnight time.
      const toGraphDateTime = (s: string) =>
        s.length === 10 ? `${s}T00:00:00` : s.length === 16 ? `${s}:00` : s;
      const patch: EventPatch = {
        subject: subject.trim(),
        location: location.trim(),
        isAllDay,
        start: { dateTime: toGraphDateTime(startStr), timeZone: event.start.timeZone },
        end: { dateTime: toGraphDateTime(endStr), timeZone: event.end.timeZone },
        bodyContent: description.trim(),
      };
      await onSave(patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save event');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="m365-create-event-form">
      {error && <div className="m365-form-error">{error}</div>}
      <div className="m365-form-field">
        <label htmlFor="m365-event-subject">Title</label>
        <input
          id="m365-event-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          autoFocus
          disabled={confirmingDelete || saving}
        />
      </div>
      <div className="m365-form-field">
        <label htmlFor="m365-event-location">Location</label>
        <input
          id="m365-event-location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Add location"
          disabled={confirmingDelete || saving}
        />
      </div>
      <div className="m365-form-checkbox">
        <label>
          <input
            type="checkbox"
            checked={isAllDay}
            onChange={(e) => handleAllDayChange(e.target.checked)}
            disabled={confirmingDelete || saving}
          />
          All day
        </label>
      </div>
      <div className="m365-form-field">
        <label htmlFor="m365-event-start">Start</label>
        <input
          id="m365-event-start"
          type={isAllDay ? 'date' : 'datetime-local'}
          value={startStr}
          onChange={(e) => setStartStr(e.target.value)}
          disabled={confirmingDelete || saving}
        />
      </div>
      <div className="m365-form-field">
        <label htmlFor="m365-event-end">End</label>
        <input
          id="m365-event-end"
          type={isAllDay ? 'date' : 'datetime-local'}
          value={endStr}
          onChange={(e) => setEndStr(e.target.value)}
          disabled={confirmingDelete || saving}
        />
      </div>
      <div className="m365-form-field">
        <label htmlFor="m365-event-description">Description</label>
        <textarea
          id="m365-event-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          disabled={confirmingDelete || saving}
        />
      </div>
      {confirmingDelete ? (
        <div className="m365-form-actions">
          <span>This will permanently delete the event.</span>
          <button onClick={() => setConfirmingDelete(false)} disabled={deleting}>
            Cancel
          </button>
          <button className="mod-warning" onClick={() => void handleDelete()} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete event'}
          </button>
        </div>
      ) : (
        <div className="m365-form-actions">
          <button onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          {onDelete && (
            <button onClick={() => setConfirmingDelete(true)} disabled={saving}>
              Delete
            </button>
          )}
          <button className="mod-cta" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'OK'}
          </button>
        </div>
      )}
    </div>
  );
};

// ── Modal ─────────────────────────────────────────────────────────────────────

export class EventDetailModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private readonly event: M365Event,
    private readonly onSaveCallback: (patch: EventPatch) => Promise<void>,
    private readonly onSaved: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('Edit event');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <StrictMode>
        <EventDetailForm
          event={this.event}
          onSave={async (patch) => {
            await this.onSaveCallback(patch);
            this.close();
            this.onSaved();
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
