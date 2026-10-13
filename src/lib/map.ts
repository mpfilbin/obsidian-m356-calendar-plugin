import type { GeoPoint } from '../types';

/** Half-width, in degrees, of the area an embedded map shows around its marker (~1.1 km). */
const EMBED_SPAN_DEG = 0.01;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** URL of an interactive OpenStreetMap embed centred on `point`, with a marker on it. */
export function osmEmbedUrl(point: GeoPoint): string {
  const lat = clamp(point.lat, -90, 90);
  const lon = clamp(point.lon, -180, 180);
  const bbox = [
    clamp(lon - EMBED_SPAN_DEG, -180, 180),
    clamp(lat - EMBED_SPAN_DEG, -90, 90),
    clamp(lon + EMBED_SPAN_DEG, -180, 180),
    clamp(lat + EMBED_SPAN_DEG, -90, 90),
  ].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}

/** URL of the full OpenStreetMap page for `point`. */
export function osmLinkUrl(point: GeoPoint): string {
  return `https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lon}#map=16/${point.lat}/${point.lon}`;
}

/** URL of a Google Maps search for the text, which works without any coordinates. */
export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
