"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { PropertyResult } from "@/lib/properties-api";
import { getMapboxToken, MAP_STYLE } from "@/lib/mapbox-shared";

interface PropertyMapProps {
  properties: PropertyResult[];
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

const SOURCE_ID = "properties";
const CIRCLE_LAYER_ID = "properties-circles";
const RISK_LAYER_ID = "properties-risk-indicator";

function toGeoJSON(properties: PropertyResult[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: properties.map((p) => ({
      type: "Feature",
      id: p.id,
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        address: p.address,
        // Sentinel: opportunityScore is null for un-scored properties. -1
        // sits below every band threshold in the `step` expression below
        // but is intercepted separately via the `hasScore` case first, so
        // it never actually falls through to the "< 60 limited" color —
        // un-scored must not visually collide with the (scored, low)
        // Limited band. See band === null handling in `circle-color`.
        score: p.opportunityScore?.score ?? -1,
        band: p.opportunityScore?.band ?? "unscored",
        hasRisk: p.riskFlagCount > 0,
      },
    })),
  };
}

/**
 * Base map + score-band markers for the Discover workspace (Mapbox GL JS).
 * Client-component-only per Mapbox's browser dependency; loaded via
 * `next/dynamic({ ssr: false })` from DiscoverWorkspace so its module (which
 * touches `window` at import time) never executes during SSR.
 *
 * Popover: a lightweight plain-HTML popup (address + score + band label),
 * not the full React OpportunityScoreBadge component — DESIGN-SYSTEM.md
 * explicitly flags the "same component vs. lighter-weight variant" choice
 * as open/unresolved for `fe` to decide; this picks the lighter-weight
 * option to avoid the ReactDOM-portal-into-a-Mapbox-Popup complexity for a
 * v1 pass. The property list beside the map (full badge component) remains
 * the accessible source of truth per DESIGN-SYSTEM.md's map-marker scope
 * note.
 */
export function PropertyMap({ properties, hoveredId, selectedId, onHover, onSelect }: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const loadedRef = useRef(false);
  const hoveredFeatureId = useRef<string | number | null>(null);

  // Init map once.
  useEffect(() => {
    const token = getMapboxToken();
    if (!token) return;
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [-81.4, 27.3], // rough central-FL fallback center, corrected by fitBounds once data loads
      zoom: 6,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      loadedRef.current = true;

      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: toGeoJSON(properties),
      });

      map.addLayer({
        id: CIRCLE_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            10,
            7,
          ],
          "circle-color": [
            "case",
            ["==", ["get", "band"], "unscored"],
            "#FFFFFF",
            [
              "step",
              ["get", "score"],
              "#CBD5E1",
              60,
              "#64748B",
              70,
              "#3FA65C",
              80,
              "#1E7A42",
              90,
              "#14532D",
            ],
          ],
          "circle-stroke-color": [
            "case",
            ["==", ["get", "band"], "unscored"],
            "#94A3B8",
            ["==", ["get", "band"], "exceptional"],
            "#FFFFFF",
            "transparent",
          ],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "band"], "unscored"],
            1.5,
            ["==", ["get", "band"], "exceptional"],
            2,
            0,
          ],
        },
      });

      // Separate, composited-on-top risk overlay — never blended into the
      // score circle color (DESIGN-SYSTEM.md: "positive signals must never
      // hide risk indicators"). This list endpoint only exposes a risk
      // *count*, not severity, so — consistent with the property card's
      // RiskFlagCountBadge decision — this uses the risk family's lowest-
      // alarm amber (not the medium/high red ramp, which would overstate
      // severity data we don't have) rather than the spec's
      // high/medium match expression (which needs `max_risk_severity`).
      map.addLayer({
        id: RISK_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["get", "hasRisk"], true],
        paint: {
          "circle-radius": 3,
          "circle-color": "#B45309",
          "circle-translate": [6, -6],
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 1,
        },
      });

      map.on("mouseenter", CIRCLE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", CIRCLE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
        onHover(null);
      });
      map.on("mousemove", CIRCLE_LAYER_ID, (e) => {
        const feature = e.features?.[0];
        if (feature?.properties) {
          onHover(feature.properties.id as string);
        }
      });
      map.on("click", CIRCLE_LAYER_ID, (e) => {
        const feature = e.features?.[0];
        if (!feature?.properties || feature.geometry.type !== "Point") return;
        const { id, address, band, score } = feature.properties as {
          id: string;
          address: string;
          band: string;
          score: number;
        };
        onSelect(id);

        popupRef.current?.remove();
        const coords = (feature.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
        const scoreLine =
          band === "unscored"
            ? "Not yet scored"
            : `Score ${score} — ${band.charAt(0).toUpperCase() + band.slice(1)}`;
        popupRef.current = new mapboxgl.Popup({ closeButton: true, offset: 12 })
          .setLngLat(coords)
          .setHTML(
            `<div style="font-family: var(--font-sans); font-size: 13px;">
              <strong style="display:block;margin-bottom:2px;">${escapeHtml(address)}</strong>
              <span>${escapeHtml(scoreLine)}</span>
            </div>`,
          )
          .addTo(map);
      });

      fitToBounds(map, properties);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the source in sync with filtered results + refit bounds.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(toGeoJSON(properties));
    fitToBounds(map, properties);
  }, [properties]);

  // Sync hover feature-state (card hover -> marker highlight, and vice versa is handled by onHover above).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;

    if (hoveredFeatureId.current !== null) {
      map.setFeatureState({ source: SOURCE_ID, id: hoveredFeatureId.current }, { hover: false });
      hoveredFeatureId.current = null;
    }
    const activeId = hoveredId ?? selectedId;
    if (activeId) {
      map.setFeatureState({ source: SOURCE_ID, id: activeId }, { hover: true });
      hoveredFeatureId.current = activeId;
    }
  }, [hoveredId, selectedId]);

  return <div ref={containerRef} className="h-full w-full rounded border border-border-subtle" />;
}

function fitToBounds(map: mapboxgl.Map, properties: PropertyResult[]) {
  if (properties.length === 0) return;
  const bounds = new mapboxgl.LngLatBounds();
  for (const p of properties) {
    bounds.extend([p.lng, p.lat]);
  }
  map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 0 });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
