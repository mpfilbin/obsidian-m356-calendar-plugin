import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { LocationMap, LocationField, type MapSupport } from '../../src/components/LocationMap';
import { CreateEventForm } from '../../src/components/CreateEventModal';
import { EventDetailForm } from '../../src/components/EventDetailModal';
import type { M365Event } from '../../src/types';

const FOUND = { lat: 47.6097, lon: -122.3425, displayName: 'Pike Place Market, Seattle, WA, USA' };

describe('LocationMap', () => {
  it('shows a loading note, then the embedded map and links once the place is found', async () => {
    let resolve!: (r: typeof FOUND) => void;
    const geocode = vi.fn().mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<LocationMap query="Pike Place" geocode={geocode} />);
    expect(screen.getByRole('status')).toHaveTextContent('Looking up location');

    resolve(FOUND);
    const frame = await screen.findByTitle('Map of Pike Place');
    expect(frame.getAttribute('src')).toContain('https://www.openstreetmap.org/export/embed.html');
    expect(frame.getAttribute('src')).toContain('marker=47.6097,-122.3425');
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
    expect(screen.getByText(FOUND.displayName)).toBeInTheDocument();
    expect(screen.getByText('OpenStreetMap')).toHaveAttribute('href', expect.stringContaining('mlat=47.6097'));
    expect(screen.getByText('Google Maps')).toHaveAttribute('href', expect.stringContaining('query=Pike%20Place'));
    expect(geocode).toHaveBeenCalledWith('Pike Place');
  });

  it('uses known coordinates without looking anything up', () => {
    const geocode = vi.fn();
    render(<LocationMap query="HQ" coordinates={{ lat: 1, lon: 2 }} geocode={geocode} />);
    expect(screen.getByTitle('Map of HQ')).toBeInTheDocument();
    expect(geocode).not.toHaveBeenCalled();
  });

  it('explains when the place cannot be found and offers a Google Maps search', async () => {
    render(<LocationMap query="Room 4" geocode={vi.fn().mockResolvedValue(null)} />);
    expect(await screen.findByText(/find "Room 4" on the map/)).toBeInTheDocument();
    expect(screen.getByText('Google Maps')).toHaveAttribute('href', expect.stringContaining('Room%204'));
    expect(screen.queryByTitle(/Map of/)).not.toBeInTheDocument();
  });

  it('shows the error message when the lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<LocationMap query="X" geocode={vi.fn().mockRejectedValue(new Error('The map service is busy. Try again in a moment.'))} />);
    expect(await screen.findByText(/map service is busy/)).toBeInTheDocument();
    expect(screen.getByText('Google Maps')).toBeInTheDocument();
  });

  it('looks up again when the query changes and ignores a slower earlier answer', async () => {
    let resolveFirst!: (r: typeof FOUND) => void;
    const geocode = vi.fn()
      .mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({ lat: 1, lon: 2, displayName: 'Second place' });
    const { rerender } = render(<LocationMap query="First" geocode={geocode} />);
    rerender(<LocationMap query="Second" geocode={geocode} />);
    expect(await screen.findByText('Second place')).toBeInTheDocument();

    resolveFirst(FOUND);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText(FOUND.displayName)).not.toBeInTheDocument();
    expect(screen.getByText('Second place')).toBeInTheDocument();
  });
});

describe('LocationField', () => {
  function Harness(props: { initial?: string; maps?: MapSupport; showInitially?: boolean; coords?: { lat: number; lon: number } }) {
    const [value, setValue] = useState(props.initial ?? '');
    return (
      <LocationField
        id="loc"
        value={value}
        onChange={setValue}
        maps={props.maps}
        showInitially={props.showInitially}
        initialCoordinates={props.coords}
      />
    );
  }
  const maps = (geocode = vi.fn().mockResolvedValue(FOUND)): MapSupport => ({ geocode });

  it('is a plain text input, with no map button, when maps are off', () => {
    render(<Harness initial="HQ" />);
    expect(screen.getByLabelText('Location')).toHaveValue('HQ');
    expect(screen.queryByText('Show on map')).not.toBeInTheDocument();
  });

  it('does not look anything up until asked', async () => {
    const m = maps();
    render(<Harness maps={m} />);
    await userEvent.type(screen.getByLabelText('Location'), 'Pike Place');
    expect(m.geocode).not.toHaveBeenCalled();
    expect(screen.getByText('Show on map')).toBeEnabled();
  });

  it('keeps the button disabled while the field is empty', () => {
    render(<Harness maps={maps()} />);
    expect(screen.getByText('Show on map')).toBeDisabled();
  });

  it('shows the map when the button is clicked, then offers to update it as the text changes', async () => {
    const m = maps();
    render(<Harness maps={m} />);
    await userEvent.type(screen.getByLabelText('Location'), 'Pike Place');
    await userEvent.click(screen.getByText('Show on map'));
    expect(await screen.findByTitle('Map of Pike Place')).toBeInTheDocument();
    expect(screen.getByText('Update map')).toBeDisabled(); // already showing this text

    await userEvent.type(screen.getByLabelText('Location'), ' Market');
    expect(screen.getByText('Update map')).toBeEnabled();
    await userEvent.click(screen.getByText('Update map'));
    await waitFor(() => expect(m.geocode).toHaveBeenLastCalledWith('Pike Place Market'));
  });

  it('shows the map when Enter is pressed in the field', async () => {
    render(<Harness maps={maps()} />);
    await userEvent.type(screen.getByLabelText('Location'), 'Pike Place{Enter}');
    expect(await screen.findByTitle('Map of Pike Place')).toBeInTheDocument();
  });

  it('shows the map for an existing location straight away when asked to', async () => {
    const m = maps();
    render(<Harness initial="Pike Place" maps={m} showInitially />);
    expect(await screen.findByTitle('Map of Pike Place')).toBeInTheDocument();
    expect(m.geocode).toHaveBeenCalledTimes(1);
  });

  it('does not show a map straight away when there is no location', () => {
    render(<Harness maps={maps()} showInitially />);
    expect(screen.queryByTitle(/Map of/)).not.toBeInTheDocument();
  });

  it("uses Outlook's coordinates for the original text but looks up edited text", async () => {
    const m = maps();
    render(<Harness initial="HQ" maps={m} showInitially coords={{ lat: 1, lon: 2 }} />);
    expect(screen.getByTitle('Map of HQ').getAttribute('src')).toContain('marker=1,2');
    expect(m.geocode).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Location'), ' Annex');
    await userEvent.click(screen.getByText('Update map'));
    await waitFor(() => expect(m.geocode).toHaveBeenCalledWith('HQ Annex'));
  });
});

describe('dialogs with maps', () => {
  const calendars = [{ id: 'c1', name: 'Work', color: '#000', isDefaultCalendar: true, canEdit: true }];
  const event: M365Event = {
    id: 'e1', subject: 'Lunch', calendarId: 'c1', isAllDay: false, location: 'Pike Place',
    start: { dateTime: '2026-04-10T12:00:00', timeZone: 'UTC' },
    end: { dateTime: '2026-04-10T13:00:00', timeZone: 'UTC' },
  };

  it('new event: location is sent with the event', async () => {
    const onSubmit = vi.fn();
    render(<CreateEventForm calendars={calendars} defaultCalendarId="c1" initialDate={new Date(2026, 3, 10)} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Lunch');
    await userEvent.type(screen.getByLabelText('Location'), '  Pike Place Market ');
    await userEvent.click(screen.getByText('Create'));
    expect(onSubmit.mock.calls[0][1].location).toBe('Pike Place Market');
  });

  it('new event: no location means none is sent', async () => {
    const onSubmit = vi.fn();
    render(<CreateEventForm calendars={calendars} defaultCalendarId="c1" initialDate={new Date(2026, 3, 10)} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Lunch');
    await userEvent.click(screen.getByText('Create'));
    expect(onSubmit.mock.calls[0][1].location).toBeUndefined();
  });

  it('new event: can preview the typed location on a map before creating', async () => {
    const geocode = vi.fn().mockResolvedValue(FOUND);
    render(<CreateEventForm calendars={calendars} defaultCalendarId="c1" initialDate={new Date(2026, 3, 10)} onSubmit={vi.fn()} onCancel={vi.fn()} maps={{ geocode }} />);
    expect(screen.queryByTitle(/Map of/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Location'), 'Pike Place');
    await userEvent.click(screen.getByText('Show on map'));
    expect(await screen.findByTitle('Map of Pike Place')).toBeInTheDocument();
  });

  it('new event: no map controls when maps are off', () => {
    render(<CreateEventForm calendars={calendars} defaultCalendarId="c1" initialDate={new Date(2026, 3, 10)} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText('Show on map')).not.toBeInTheDocument();
  });

  it('edit event: shows the existing location on a map right away', async () => {
    const geocode = vi.fn().mockResolvedValue(FOUND);
    render(<EventDetailForm event={event} calendars={calendars} onSave={vi.fn()} onCancel={vi.fn()} maps={{ geocode }} />);
    expect(await screen.findByTitle('Map of Pike Place')).toBeInTheDocument();
  });

  it("edit event: uses Outlook's coordinates for the existing location without a lookup", () => {
    const geocode = vi.fn();
    render(<EventDetailForm event={{ ...event, locationCoordinates: { lat: 5, lon: 6 } }} calendars={calendars} onSave={vi.fn()} onCancel={vi.fn()} maps={{ geocode }} />);
    expect(screen.getByTitle('Map of Pike Place').getAttribute('src')).toContain('marker=5,6');
    expect(geocode).not.toHaveBeenCalled();
  });

  it('edit event: changing the location saves the new text', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EventDetailForm event={event} calendars={calendars} onSave={onSave} onCancel={vi.fn()} maps={{ geocode: vi.fn().mockResolvedValue(FOUND) }} />);
    const input = screen.getByLabelText('Location');
    await userEvent.clear(input);
    await userEvent.type(input, 'Space Needle');
    await userEvent.click(screen.getByText('OK'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].location).toBe('Space Needle');
  });

  it('edit event: no map when maps are off, but the location is still editable', () => {
    render(<EventDetailForm event={event} calendars={calendars} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('Location')).toHaveValue('Pike Place');
    expect(screen.queryByTitle(/Map of/)).not.toBeInTheDocument();
    expect(screen.queryByText('Update map')).not.toBeInTheDocument();
  });

  it('edit event: the map controls are disabled while saving', async () => {
    let finish!: () => void;
    const onSave = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<EventDetailForm event={event} calendars={calendars} onSave={onSave} onCancel={vi.fn()} maps={{ geocode: vi.fn().mockResolvedValue(FOUND) }} />);
    await userEvent.type(screen.getByLabelText('Location'), ' Market');
    await userEvent.click(screen.getByText('OK'));
    expect(await screen.findByText('Saving…')).toBeDisabled();
    expect(screen.getByLabelText('Location')).toBeDisabled();
    expect(screen.getByText('Update map')).toBeDisabled();
    finish();
  });
});
