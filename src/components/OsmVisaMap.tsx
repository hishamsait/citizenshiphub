import { useEffect, useRef } from 'react';
import { STATUS_FILL, STATUS_LABEL, type AccessStatus } from '../lib/visa';
import type { SlimGeoJson } from '../lib/map';
import { initOsmVisaMap, type OsmVisaMapHandle } from '../lib/osm-map';

interface Props {
  geo: SlimGeoJson;
  statusByIso2: Record<string, AccessStatus>;
  interactive?: boolean;
}

const LEGEND: AccessStatus[] = ['visa-free', 'visa-on-arrival', 'eta', 'e-visa', 'visa-required', 'no-admission'];

type MapUpdate = {
  statusByIso2?: Record<string, AccessStatus>;
  homeCode?: string;
  activeFilters?: ReadonlySet<AccessStatus>;
};

export default function OsmVisaMap({ geo, statusByIso2, interactive = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<OsmVisaMapHandle | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let handle: OsmVisaMapHandle | null = null;

    initOsmVisaMap({ container, geo, statusByIso2 }).then((h) => {
      if (disposed) {
        h.map.remove();
        return;
      }
      handle = h;
      handleRef.current = h;

      // The explore page publishes its latest status to a global as soon as the
      // visa matrix resolves — which can happen before Leaflet finishes loading.
      // Apply it now so the initial coloring isn't lost.
      if (interactive) {
        const latest = (window as { __visaMapState?: MapUpdate }).__visaMapState;
        if (latest) {
          h.setStatusByIso2(latest.statusByIso2 ?? {}, latest.homeCode, latest.activeFilters);
        }
      }
    });

    return () => {
      disposed = true;
      handle?.map.remove();
      handleRef.current = null;
    };
    // Initialize once on mount; status updates arrive via the custom event below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!interactive) return;
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail as MapUpdate | undefined;
      handleRef.current?.setStatusByIso2(detail?.statusByIso2 ?? {}, detail?.homeCode, detail?.activeFilters);
    };
    window.addEventListener('visa-map:update', onUpdate);
    return () => window.removeEventListener('visa-map:update', onUpdate);
  }, [interactive]);

  return (
    <div>
      <div
        ref={containerRef}
        className="osm-visa-map relative z-0 h-[420px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm sm:h-[480px]"
        role="application"
        aria-label="Interactive world map of visa access"
      />
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {LEGEND.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: STATUS_FILL[s] }} />
            {STATUS_LABEL[s]}
          </li>
        ))}
      </ul>
    </div>
  );
}