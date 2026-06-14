# Recurring Event Creation — Design Spec

**Date:** 2026-06-14
**Branch:** mpf/add-recurrent-events

## Overview

Add recurrence support to the Create Event modal. When creating a new event, users can opt into a repeating series by checking a "Repeat" checkbox, then configuring frequency, interval, day-of-week (for weekly), monthly mode (absolute or relative), and an end condition.

---

## Types (`src/types/index.ts`)

New types added alongside the existing `TaskRecurrence`:

```typescript
export type RecurrenceFrequency =
  | 'daily'
  | 'weekly'
  | 'absoluteMonthly'   // fixed day-of-month (e.g., the 15th)
  | 'relativeMonthly'   // relative weekday (e.g., second Tuesday)
  | 'absoluteYearly';   // same date every year

export type DayOfWeek =
  | 'sunday' | 'monday' | 'tuesday' | 'wednesday'
  | 'thursday' | 'friday' | 'saturday';

export type WeekIndex = 'first' | 'second' | 'third' | 'fourth' | 'last';

export type RecurrenceEndType = 'noEnd' | 'endDate' | 'numbered';

export interface EventRecurrence {
  frequency: RecurrenceFrequency;
  interval: number;                     // 1 = every period, 2 = every other, etc.
  daysOfWeek?: DayOfWeek[];            // required for weekly; single entry for relativeMonthly
  weekIndex?: WeekIndex;               // required for relativeMonthly (e.g., "second")
  end: {
    type: RecurrenceEndType;
    endDate?: string;                  // YYYY-MM-DD; when type = 'endDate'
    numberOfOccurrences?: number;      // when type = 'numbered'
  };
}
```

`NewEventInput` gains `recurrence?: EventRecurrence`.

For `relativeMonthly`, `daysOfWeek` (single-entry) and `weekIndex` are derived from the event's start date at submission time — not user-entered. For `absoluteYearly`, `dayOfMonth` and `month` are also derived from the start date in the service layer.

---

## Service Layer (`src/services/CalendarService.ts`)

A private helper `buildRecurrenceBody(r: EventRecurrence, start: Date)` maps `EventRecurrence` to the Microsoft Graph API `recurrence` object shape.

### Pattern mapping

| `frequency`        | Graph `pattern.type`  | Extra fields                                              |
|--------------------|-----------------------|-----------------------------------------------------------|
| `daily`            | `daily`               | —                                                         |
| `weekly`           | `weekly`              | `daysOfWeek` from `r.daysOfWeek`                          |
| `absoluteMonthly`  | `absoluteMonthly`     | `dayOfMonth` from `start.getDate()`                       |
| `relativeMonthly`  | `relativeMonthly`     | `daysOfWeek` (single entry), `index` from `r.weekIndex`   |
| `absoluteYearly`   | `absoluteYearly`      | `dayOfMonth`, `month` from start date                     |

### Range mapping

| `end.type`  | Graph `range.type` | Extra fields                          |
|-------------|---------------------|---------------------------------------|
| `noEnd`     | `noEnd`             | —                                     |
| `endDate`   | `endDate`           | `endDate: r.end.endDate`              |
| `numbered`  | `numbered`          | `numberOfOccurrences: r.end.numberOfOccurrences` |

All ranges include `startDate` (derived from `start` param as `YYYY-MM-DD`) and `recurrenceTimeZone` (IANA timezone from `Intl.DateTimeFormat`).

`createEvent` spreads the recurrence block into the Graph API body only when `input.recurrence` is present. No changes to `deleteEvent`, `updateEvent`, or `moveEvent`.

---

## UI (`src/components/CreateEventModal.tsx`)

Follows the pattern established in `CreateTaskModal.tsx`.

### New form state

| Field           | Type                                          | Default                        |
|-----------------|-----------------------------------------------|--------------------------------|
| `repeat`        | `boolean`                                     | `false`                        |
| `frequency`     | `'daily' \| 'weekly' \| 'monthly' \| 'yearly'` | `'weekly'`                     |
| `intervalStr`   | `string`                                      | `'1'`                          |
| `daysOfWeek`    | `DayOfWeek[]`                                 | `[start-day-of-week]`          |
| `monthlyMode`   | `'absolute' \| 'relative'`                    | `'absolute'`                   |
| `endType`       | `RecurrenceEndType`                           | `'noEnd'`                      |
| `endDateStr`    | `string`                                      | `''` (populated on selection)  |
| `occurrencesStr`| `string`                                      | `'10'`                         |

### Layout (when Repeat is checked)

```
[✓] Repeat

  Frequency:  [Daily ▾]
  Every:      [1] days

  — for Weekly only —
  Days: [Su] [M] [Tu] [W] [Th] [F] [Sa]

  — for Monthly only —
  (○) On day 15 of the month
  (○) On the second Tuesday

  End:
  (●) No end
  ( ) End by  [date input]
  ( ) After   [N] occurrences
```

- The day-of-week row initialises with the event start day pre-checked. User can check any combination; at least one must remain checked.
- The "Monthly" option in the frequency select maps to either `absoluteMonthly` or `relativeMonthly` based on `monthlyMode`. Both labels are computed from the start date (e.g., if start is the 15th on a Tuesday and it's the 2nd Tuesday of the month, the labels read "On day 15 of the month" / "On the second Tuesday").
- The "Yearly" option maps to `absoluteYearly`. No extra controls are shown.
- Interval label updates with frequency: "day(s)" / "week(s)" / "month(s)" / "year(s)".

### Validation (on submit)

- Weekly: at least one day of the week must be selected.
- `endDate` type: end date must be after the event start date.
- `numbered` type: occurrences must be ≥ 1.
- Interval must be ≥ 1.

### `buildRecurrence` helper (form → `EventRecurrence`)

A local function in `CreateEventModal.tsx` converts form state to `EventRecurrence` before calling `onSubmit`. This keeps the submission handler clean and makes the mapping independently testable.

---

## Error Handling

- Service layer: existing error throw pattern (`Failed to create event`) — no change.
- UI: existing `setError` / `m365-form-error` pattern — validation errors shown inline above the form actions.

---

## Testing

- Unit tests for `buildRecurrenceBody` in `CalendarService` covering all 5 frequency types and all 3 end conditions.
- Unit tests for the `buildRecurrence` form-state helper in `CreateEventModal`.
- Component test: render `CreateEventForm`, check the "Repeat" checkbox, assert recurrence fields appear; submit and assert `onSubmit` is called with the correct `EventRecurrence` shape.

---

## Out of scope

- Editing an existing event's recurrence pattern (covered by existing series-delete flow).
- Relative yearly recurrence (e.g., "every second Tuesday of June").
- Location field on the create form (separate feature).
