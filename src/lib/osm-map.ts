import type * as L from 'leaflet';
import { STATUS_LABEL, type AccessStatus } from './visa';
import type { SlimGeoJson } from './map';

export interface OsmVisaMapHandle {
  map: L.Map;
  layer: L.GeoJSON;
  setStatusByIso2: (
    statusByIso2: Record<string, AccessStatus>,
    homeCode?: string,
    activeFilters?: ReadonlySet<AccessStatus>,
  ) => void;
}

export interface OsmVisaMapOptions {
  container: HTMLElement;
  geo: SlimGeoJson;
  statusByIso2: Record<string, AccessStatus>;
}

type MapFeature = { properties?: { iso2?: string; name?: string } };

interface MapState {
  statusByIso2: Record<string, AccessStatus>;
  homeCode?: string;
  activeFilters?: ReadonlySet<AccessStatus>;
}

const FILL_CLASS: Record<AccessStatus, string> = {
  'visa-free': 'map-fill-visa-free',
  'visa-on-arrival': 'map-fill-visa-on-arrival',
  eta: 'map-fill-eta',
  'e-visa': 'map-fill-e-visa',
  'visa-required': 'map-fill-visa-required',
  'no-admission': 'map-fill-no-admission',
  home: 'map-fill-home',
  unknown: 'map-fill-unknown',
};

const ALL_FILL_CLASSES = Object.values(FILL_CLASS);

function featureProps(feature?: MapFeature): { iso2: string; name: string } {
  return {
    iso2: feature?.properties?.iso2 ?? '',
    name: feature?.properties?.name ?? '',
  };
}

function statusFor(feature: MapFeature | undefined, state: MapState): AccessStatus {
  const { iso2 } = featureProps(feature);
  if (state.homeCode && iso2 === state.homeCode) return 'home';
  return state.statusByIso2[iso2] ?? 'unknown';
}

function isDimmed(feature: MapFeature | undefined, state: MapState): boolean {
  const status = statusFor(feature, state);
  return Boolean(state.activeFilters) && status !== 'home' && status !== 'unknown' && !state.activeFilters!.has(status);
}

function tooltipText(feature: MapFeature | undefined, state: MapState): string {
  const { iso2, name } = featureProps(feature);
  return `${name || iso2 || 'Unknown'} — ${STATUS_LABEL[statusFor(feature, state)]}`;
}

function applyClasses(layer: L.GeoJSON, state: MapState): void {
  layer.eachLayer((l) => {
    const feature = (l as unknown as { feature?: MapFeature }).feature;
    const el = (l as unknown as { _path?: Element })._path;
    if (!el) return;
    const status = statusFor(feature, state);
    el.classList.remove(...ALL_FILL_CLASSES, 'map-dimmed');
    el.classList.add('country-path', FILL_CLASS[status]);
    el.classList.toggle('map-dimmed', isDimmed(feature, state));
  });
}

export async function initOsmVisaMap({ container, geo, statusByIso2 }: OsmVisaMapOptions): Promise<OsmVisaMapHandle> {
  // Load Leaflet lazily so it is never evaluated during server-side rendering.
  const L = await import('leaflet');
  const state: MapState = { statusByIso2 };

  const map = L.map(container, {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 10,
    zoomControl: true,
    scrollWheelZoom: false,
    worldCopyJump: true,
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const layer = L.geoJSON(geo as unknown as GeoJSON.FeatureCollection, {
    onEachFeature: (feature, l) => {
      l.bindTooltip(() => tooltipText(feature as MapFeature, state), { sticky: true });
    },
  }).addTo(map);

  applyClasses(layer, state);
  map.fitBounds(layer.getBounds(), { padding: [12, 12] });

  return {
    map,
    layer,
    setStatusByIso2(next, homeCode, activeFilters) {
      state.statusByIso2 = next;
      state.homeCode = homeCode;
      state.activeFilters = activeFilters;
      applyClasses(layer, state);
    },
  };
}