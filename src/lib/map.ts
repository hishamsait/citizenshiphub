import worldGeo from '../data/world-countries.geo.json';

export interface SlimFeature {
  type: 'Feature';
  properties: {
    iso2: string;
    name: string;
  };
  geometry: unknown;
}

export interface SlimGeoJson {
  type: 'FeatureCollection';
  features: SlimFeature[];
}

type WorldFeature = {
  type?: string;
  properties?: {
    ISO_A2?: string | number | null;
    ISO_A2_EH?: string | number | null;
    NAME?: string | null;
  };
  geometry?: unknown;
};

type WorldCollection = {
  type?: string;
  features: WorldFeature[];
};

/** Round numeric coordinates to ~110 m to keep the client-side payload small. */
function roundValue(value: unknown, precision = 3): unknown {
  if (typeof value === 'number') {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }
  if (Array.isArray(value)) {
    return value.map((v) => roundValue(v, precision));
  }
  return value;
}

let cache: SlimGeoJson | null = null;

/** Produce a slim, client-safe copy of the bundled world GeoJSON for interactive maps. */
export function getWorldGeoJson(): SlimGeoJson {
  if (cache) return cache;
  const src = worldGeo as unknown as WorldCollection;
  cache = {
    type: 'FeatureCollection',
    features: src.features
      .map((f) => {
        // Natural Earth stores multi-part / disputed countries with ISO_A2 = "-99"
        // (France, Norway, Kosovo) and puts the real two-letter code in ISO_A2_EH.
        // Prefer ISO_A2_EH so those countries still resolve to their canonical code.
        const iso2 = String(f.properties?.ISO_A2_EH ?? f.properties?.ISO_A2 ?? '')
          .trim()
          .toUpperCase();
        return {
          type: 'Feature' as const,
          properties: {
            iso2,
            name: f.properties?.NAME ?? '',
          },
          geometry: roundValue(f.geometry),
        };
      })
      .filter((f) => f.properties.iso2 && f.properties.iso2 !== '-99' && f.geometry),
  };
  return cache;
}
