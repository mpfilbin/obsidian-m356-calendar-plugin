import { describe, it, expect } from 'vitest';
import { osmEmbedUrl, osmLinkUrl, googleMapsSearchUrl } from '../../src/lib/map';

describe('map URLs', () => {
  it('osmEmbedUrl centres the embed on the marker', () => {
    const url = new URL(osmEmbedUrl({ lat: 47.6097, lon: -122.3425 }));
    expect(url.origin + url.pathname).toBe('https://www.openstreetmap.org/export/embed.html');
    expect(url.searchParams.get('marker')).toBe('47.6097,-122.3425');
    expect(url.searchParams.get('layer')).toBe('mapnik');
    const [west, south, east, north] = (url.searchParams.get('bbox') ?? '').split(',').map(Number);
    expect((west + east) / 2).toBeCloseTo(-122.3425, 6);
    expect((south + north) / 2).toBeCloseTo(47.6097, 6);
    expect(east).toBeGreaterThan(west);
    expect(north).toBeGreaterThan(south);
  });

  it('osmEmbedUrl keeps the box inside the world near the poles and the date line', () => {
    const url = new URL(osmEmbedUrl({ lat: 89.999, lon: 179.999 }));
    const [west, south, east, north] = (url.searchParams.get('bbox') ?? '').split(',').map(Number);
    expect(east).toBeLessThanOrEqual(180);
    expect(north).toBeLessThanOrEqual(90);
    expect(west).toBeGreaterThanOrEqual(-180);
    expect(south).toBeGreaterThanOrEqual(-90);
  });

  it('osmLinkUrl opens the full map at the point', () => {
    expect(osmLinkUrl({ lat: 51.5, lon: -0.12 })).toBe('https://www.openstreetmap.org/?mlat=51.5&mlon=-0.12#map=16/51.5/-0.12');
  });

  it('googleMapsSearchUrl escapes the text', () => {
    expect(googleMapsSearchUrl('Joe & Sons, 5th Ave #2')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Joe%20%26%20Sons%2C%205th%20Ave%20%232',
    );
  });
});
