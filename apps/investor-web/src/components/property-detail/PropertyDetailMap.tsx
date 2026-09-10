"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getMapboxToken, MAP_STYLE, scoreBandMarkerColor } from "@/lib/mapbox-shared";
import type { OpportunityBand } from "@/lib/properties-api";

interface PropertyDetailMapProps {
  lat: number;
  lng: number;
  band: OpportunityBand | null;
  hasRisk: boolean;
}

/**
 * Single-property map for the Property Intelligence Page — a centered
 * marker at higher zoom (satellite view), reusing the Discover map's token
 * resolution and score-band color logic (`@/lib/mapbox-shared`) rather than
 * rebuilding Mapbox setup from scratch. Unlike the Discover map, this is a
 * single DOM `mapboxgl.Marker` (no GL circle-layer / feature-state / popover
 * machinery needed for exactly one point) and has no hover/select
 * interactivity to wire up — it's a static locator, not a filterable index.
 */
export function PropertyDetailMap({ lat, lng, band, hasRisk }: PropertyDetailMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    const token = getMapboxToken();
    if (!token || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [lng, lat],
      zoom: 15,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    const marker = document.createElement("div");
    marker.style.position = "relative";
    marker.style.width = "20px";
    marker.style.height = "20px";
    marker.style.borderRadius = "50%";
    marker.style.backgroundColor = scoreBandMarkerColor(band);
    marker.style.border = "2px solid #FFFFFF";
    marker.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.35)";

    // Risk is a separate, mandatory overlay cue composited on top of the
    // score color — never blended into it — same rule DESIGN-SYSTEM.md
    // applies to the Discover map's risk layer ("positive signals must
    // never hide risk indicators").
    if (hasRisk) {
      const riskDot = document.createElement("div");
      riskDot.style.position = "absolute";
      riskDot.style.top = "-4px";
      riskDot.style.right = "-4px";
      riskDot.style.width = "10px";
      riskDot.style.height = "10px";
      riskDot.style.borderRadius = "50%";
      riskDot.style.backgroundColor = "#B45309";
      riskDot.style.border = "1.5px solid #FFFFFF";
      marker.appendChild(riskDot);
    }

    new mapboxgl.Marker({ element: marker }).setLngLat([lng, lat]).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, band, hasRisk]);

  return <div ref={containerRef} className="h-full w-full rounded border border-border-subtle" />;
}
