import { App, Modal } from 'obsidian';
import React, { StrictMode, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { M365Calendar, NewEventInput, EventRecurrence, RecurrenceFrequency, DayOfWeek, WeekIndex, RecurrenceEndType } from '../types';
import { toDateOnly, toDateTimeLocal, parseDateInput } from '../lib/datetime';

const DAY_NAMES: DayOfWeek[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

const DAY_ABBREVS: Record<DayOfWeek, string> = {
  sunday: 'Su', monday: 'M', tuesday: 'Tu', wednesday: 'W',
  thursday: 'Th', friday: 'F', saturday: 'Sa',
};

const INTERVAL_LABELS: Record<'daily' | 'weekly' | 'monthly' | 'yearly', string> = {
  daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', yearly: 'year(s)',
};

const DAY_DISPLAY: Record<DayOfWeek, string> = {
  sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday',
};

function getDayOfWeek(date: Date): DayOfWeek {
  return DAY_NAMES[date.getDay()];
}

function getWeekIndex(date: Date): WeekIndex {
  const dayOfMonth = date.getDate();
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  if (dayOfMonth + 7 > daysInMonth) return 'last';
  const occurrence = Math.ceil(dayOfMonth / 7);
  return (['first', 'second', 'third', 'fourth'] as const)[occurrence - 1];
}

export function buildRecurrence(
  repeat: boolean,
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly',
  intervalStr: string,
  daysOfWeek: DayOfWeek[],
  monthlyMode: 'absolute' | 'relative',
  endType: RecurrenceEndType,
  endDateStr: string,
  occurrencesStr: string,
  startDate: Date,
): EventRecurrence | undefined {
  if (!repeat) return undefined;
  const interval = Math.max(1, parseInt(intervalStr) || 1);
  let freq: RecurrenceFrequency;
  let recDaysOfWeek: DayOfWeek[] | undefined;
  let weekIndex: WeekIndex | undefined;
  if (frequency === 'daily') {
    freq = 'daily';
  } else if (frequency === 'weekly') {
    freq = 'weekly';
    recDaysOfWeek = daysOfWeek.length > 0 ? daysOfWeek : [getDayOfWeek(startDate)];
  } else if (frequency === 'monthly') {
    if (monthlyMode === 'relative') {
      freq = 'relativeMonthly';
      recDaysOfWeek = [getDayOfWeek(startDate)];
      weekIndex = getWeekIndex(startDate);
    } else {
      freq = 'absoluteMonthly';
    }
  } else {
    freq = 'absoluteYearly';
  }
  const end: EventRecurrence['end'] = { type: endType };
  if (endType === 'endDate') end.endDate = endDateStr;
  if (endType === 'numbered') end.numberOfOccurrences = Math.max(1, parseInt(occurrencesStr) || 1);
  return {
    frequency: freq,
    interval,
    ...(recDaysOfWeek !== undefined ? { daysOfWeek: recDaysOfWeek } : {}),
    ...(weekIndex !== undefined ? { weekIndex } : {}),
    end,
  };
}

interface CreateEventFormProps {
  calendars: M365Calendar[];
  defaultCalendarId: string;
  initialDate: Date;
  initialAllDay?: boolean;
  onSubmit: (calendarId: string, event: NewEventInput) => void;
  onCancel: () => void;
}

export const CreateEventForm: React.FC<CreateEventFormProps> = ({
  calendars,
  defaultCalendarId,
  initialDate,
  initialAllDay = false,
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

  const [isAllDay, setIsAllDay] = useState(initialAllDay);
  const [startStr, setStartStr] = useState(() => {
    if (initialAllDay) return toDateOnly(defaultStart);
    return toDateTimeLocal(defaultStart);
  });
  const [endStr, setEndStr] = useState(() => {
    if (initialAllDay) {
      const nextDay = new Date(defaultStart);
      nextDay.setDate(nextDay.getDate() + 1);
      return toDateOnly(nextDay);
    }
    return toDateTimeLocal(defaultEnd);
  });
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const [repeat, setRepeat] = useState(false);
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('weekly');
  const [intervalStr, setIntervalStr] = useState('1');
  const [daysOfWeek, setDaysOfWeek] = useState<DayOfWeek[]>([getDayOfWeek(initialDate)]);
  const [monthlyMode, setMonthlyMode] = useState<'absolute' | 'relative'>('absolute');
  const [endType, setEndType] = useState<RecurrenceEndType>('noEnd');
  const [recurrenceEndDateStr, setRecurrenceEndDateStr] = useState(() => {
    const d = new Date(initialDate);
    d.setFullYear(d.getFullYear() + 1);
    return toDateOnly(d);
  });
  const [occurrencesStr, setOccurrencesStr] = useState('10');

  const toggleDay = (day: DayOfWeek) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const handleAllDayChange = (checked: boolean) => {
    setIsAllDay(checked);
    const s = parseDateInput(startStr);
    const e = parseDateInput(endStr);
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
    const start = parseDateInput(startStr);
    const end = parseDateInput(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setError('Invalid date or time');
      return;
    }
    if (isAllDay) {
      if (endStr <= startStr) {
        setError('For all-day events, the end date must be after the start date');
        return;
      }
    } else if (end <= start) {
      setError('End time must be after start time');
      return;
    }
    if (repeat) {
      if (frequency === 'weekly' && daysOfWeek.length === 0) {
        setError('Select at least one day of the week');
        return;
      }
      if (endType === 'endDate') {
        const startDateOnly = startStr.slice(0, 10);
        if (!recurrenceEndDateStr || recurrenceEndDateStr <= startDateOnly) {
          setError('Recurrence end date must be after the event start date');
          return;
        }
      }
      if (endType === 'numbered' && (parseInt(occurrencesStr) || 0) < 1) {
        setError('Number of occurrences must be at least 1');
        return;
      }
    }
    onSubmit(calendarId, {
      subject: subject.trim(),
      start,
      end,
      isAllDay,
      description: description.trim() || undefined,
      recurrence: buildRecurrence(repeat, frequency, intervalStr, daysOfWeek, monthlyMode, endType, recurrenceEndDateStr, occurrencesStr, start),
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
      <div className="m365-form-checkbox">
        <label>
          <input
            type="checkbox"
            checked={repeat}
            onChange={(e) => setRepeat(e.target.checked)}
          />
          Repeat
        </label>
      </div>
      {repeat && (
        <div className="m365-form-recurrence">
          <div className="m365-form-field">
            <label htmlFor="m365-create-frequency">Frequency</label>
            <select
              id="m365-create-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly' | 'monthly' | 'yearly')}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div className="m365-form-field">
            <label htmlFor="m365-create-interval">Every</label>
            <input
              id="m365-create-interval"
              type="number"
              min="1"
              value={intervalStr}
              onChange={(e) => setIntervalStr(e.target.value)}
            />
            <span>{INTERVAL_LABELS[frequency]}</span>
          </div>
          {frequency === 'weekly' && (
            <div className="m365-form-days-of-week">
              {DAY_NAMES.map((day) => (
                <label key={day} className="m365-day-toggle">
                  <input
                    type="checkbox"
                    checked={daysOfWeek.includes(day)}
                    onChange={() => toggleDay(day)}
                    aria-label={DAY_DISPLAY[day]}
                  />
                  <span aria-hidden="true">{DAY_ABBREVS[day]}</span>
                </label>
              ))}
            </div>
          )}
          {frequency === 'monthly' && (() => {
            const startDateForMonthly = new Date(startStr.length === 10 ? `${startStr}T00:00` : startStr);
            const isValidStart = !isNaN(startDateForMonthly.getTime());
            const refDate = isValidStart ? startDateForMonthly : initialDate;
            const dayOfMonth = refDate.getDate();
            const weekIdxLabel = getWeekIndex(refDate);
            const dayName = DAY_DISPLAY[getDayOfWeek(refDate)];
            return (
              <div className="m365-form-recurrence-monthly">
                <label>
                  <input
                    type="radio"
                    name="m365-monthly-mode"
                    checked={monthlyMode === 'absolute'}
                    onChange={() => setMonthlyMode('absolute')}
                    aria-label={`On day ${dayOfMonth} of the month`}
                  />
                  On day {dayOfMonth} of the month
                </label>
                <label>
                  <input
                    type="radio"
                    name="m365-monthly-mode"
                    checked={monthlyMode === 'relative'}
                    onChange={() => setMonthlyMode('relative')}
                    aria-label={`On the ${weekIdxLabel} ${dayName}`}
                  />
                  On the {weekIdxLabel} {dayName}
                </label>
              </div>
            );
          })()}
          <fieldset className="m365-form-recurrence-end">
            <legend>End</legend>
            <label>
              <input
                type="radio"
                name="m365-end-type"
                checked={endType === 'noEnd'}
                onChange={() => setEndType('noEnd')}
                aria-label="No end"
              />
              No end
            </label>
            <label>
              <input
                type="radio"
                name="m365-end-type"
                checked={endType === 'endDate'}
                onChange={() => setEndType('endDate')}
                aria-label="End by"
              />
              End by
            </label>
            {endType === 'endDate' && (
              <input
                type="date"
                value={recurrenceEndDateStr}
                onChange={(e) => setRecurrenceEndDateStr(e.target.value)}
                aria-label="Recurrence end date"
              />
            )}
            <label>
              <input
                type="radio"
                name="m365-end-type"
                checked={endType === 'numbered'}
                onChange={() => setEndType('numbered')}
                aria-label="After"
              />
              After
            </label>
            {endType === 'numbered' && (
              <>
                <input
                  type="number"
                  min="1"
                  value={occurrencesStr}
                  onChange={(e) => setOccurrencesStr(e.target.value)}
                  aria-label="Number of occurrences"
                />
                <span>occurrences</span>
              </>
            )}
          </fieldset>
        </div>
      )}
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
    private readonly initialAllDay: boolean = false,
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
          initialAllDay={this.initialAllDay}
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
