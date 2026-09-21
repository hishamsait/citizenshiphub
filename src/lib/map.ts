import { geoNaturalEarth1, geoPath } from 'd3-geo';
import worldGeo from '../data/world-countries.geo.json';

export interface MapCountry {
  iso2: string;
  name: string;
  d: string;
}

type WorldFeature = {
  properties?: { ISO_A2?: string | number | null; NAME?: string | null };
};

let cache: MapCountry[] | null = null;

/** Project the bundled world GeoJSON into SVG path strings (server-side only). */
export function getWorldPaths(): MapCountry[] {
  if (cache) return cache;
  const projection = geoNaturalEarth1().fitSize([960, 500], { type: 'Sphere' } as never);
  const path = geoPath(projection);
  const features = (worldGeo as unknown as { features: WorldFeature[] }).features;
  cache = features
    .map((f) => ({
      iso2: String(f.properties?.ISO_A2 ?? '')
        .trim()
        .toUpperCase(),
      name: f.properties?.NAME ?? '',
      d: path(f as never) ?? '',
    }))
    .filter((c) => c.iso2 && c.iso2 !== '-99' && c.d);
  return cache;
}
