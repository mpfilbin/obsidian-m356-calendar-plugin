import React, { useEffect, useState } from 'react';
import { GeoPoint } from '../types';
import { GeocodeResult } from '../services/GeocodingService';
import { googleMapsSearchUrl, osmEmbedUrl, osmLinkUrl } from '../lib/map';
import { appLogger } from '../lib/logger';

/** What the dialogs need to show maps. Absent means maps are switched off. */
export interface MapSupport {
  geocode: (query: string) => Promise<GeocodeResult | null>;
}

type MapState =
  | { status: 'loading' }
  | { status: 'found'; point: GeoPoint; label?: string }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

interface LocationMapProps {
  /** The place to show. A new value triggers a new lookup. */
  query: string;
  /** Known coordinates for `query` (from Outlook); skips the lookup. */
  coordinates?: GeoPoint;
  geocode: MapSupport['geocode'];
}

/** An embedded OpenStreetMap showing `query`, with links to open it in a full map. */
export const LocationMap: React.FC<LocationMapProps> = ({ query, coordinates, geocode }) => {
  const [state, setState] = useState<MapState>(
    coordinates ? { status: 'found', point: coordinates } : { status: 'loading' },
  );

  useEffect(() => {
    if (coordinates) {
      setState({ status: 'found', point: coordinates });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    geocode(query)
      .then((result) => {
        if (cancelled) return;
        setState(result
          ? { status: 'found', point: { lat: result.lat, lon: result.lon }, label: result.displayName }
          : { status: 'not-found' });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        appLogger.error('[M365 Calendar] Map lookup failed:', e);
        setState({ status: 'error', message: e instanceof Error ? e.message : 'The map could not be loaded.' });
      });
    return () => { cancelled = true; };
  }, [query, coordinates?.lat, coordinates?.lon, geocode]);

  const googleLink = (
    <a href={googleMapsSearchUrl(query)} target="_blank" rel="noopener noreferrer">Google Maps</a>
  );

  if (state.status === 'loading') {
    return <div className="m365-location-map-status" role="status">Looking up location…</div>;
  }
  if (state.status === 'not-found') {
    return (
      <div className="m365-location-map-status">
        Couldn&apos;t find &quot;{query}&quot; on the map. Try adding a street address or city. Search in {googleLink}.
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="m365-location-map-status m365-location-map-error">
        {state.message} Search in {googleLink}.
      </div>
    );
  }
  return (
    <div className="m365-location-map">
      <iframe
        className="m365-location-map-frame"
        title={`Map of ${query}`}
        src={osmEmbedUrl(state.point)}
        sandbox="allow-scripts allow-same-origin"
        loading="lazy"
      />
      <div className="m365-location-map-caption">
        {state.label && <span className="m365-location-map-label">{state.label}</span>}
        <span className="m365-location-map-links">
          <a href={osmLinkUrl(state.point)} target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
          {' · '}
          {googleLink}
        </span>
      </div>
    </div>
  );
};

interface LocationFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Omit to show a plain text input with no map. */
  maps?: MapSupport;
  /** Show the map for the initial value as soon as the field appears (editing an existing event). */
  showInitially?: boolean;
  /** Coordinates Outlook already holds for the initial value. */
  initialCoordinates?: GeoPoint;
}

/** The Location input, plus a button and map to see the place. */
export const LocationField: React.FC<LocationFieldProps> = ({
  id, value, onChange, disabled = false, maps, showInitially = false, initialCoordinates,
}) => {
  const [initialValue] = useState(value.trim());
  const [mapped, setMapped] = useState<string | null>(showInitially && initialValue ? initialValue : null);
  const query = value.trim();

  const show = () => {
    if (query) setMapped(query);
  };

  return (
    <div className="m365-form-field">
      <label htmlFor={id}>Location</label>
      <div className="m365-location-input-row">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && maps) {
              e.preventDefault();
              show();
            }
          }}
          placeholder="Add location"
          disabled={disabled}
        />
        {maps && (
          <button
            type="button"
            onClick={show}
            disabled={disabled || !query || query === mapped}
          >
            {mapped ? 'Update map' : 'Show on map'}
          </button>
        )}
      </div>
      {maps && mapped && (
        <LocationMap
          query={mapped}
          coordinates={mapped === initialValue ? initialCoordinates : undefined}
          geocode={maps.geocode}
        />
      )}
    </div>
  );
};
