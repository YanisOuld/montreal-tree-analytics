import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { Tree } from "../api";

const MONTREAL_CENTER: [number, number] = [45.55, -73.65];

// Clé CARTO Basemaps (retire le filigrane « API key required »).
// Définie dans frontend/.env (non versionné) -> VITE_CARTO_KEY.
const CARTO_KEY = import.meta.env.VITE_CARTO_KEY ?? "";
const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" +
  (CARTO_KEY ? `?key=${CARTO_KEY}` : "");

// Rendu impératif par canvas : des dizaines de milliers de points sans
// surcharger React (un composant par marqueur serait ingérable).
function TreeLayer({ trees }: { trees: Tree[] }) {
  const map = useMap();
  const rendererRef = useRef<L.Canvas | null>(null);

  useEffect(() => {
    if (!rendererRef.current) {
      rendererRef.current = L.canvas({ padding: 0.5 });
    }
    const renderer = rendererRef.current;
    const group = L.layerGroup();

    for (const t of trees) {
      L.circleMarker([t.latitude, t.longitude], {
        renderer,
        radius: 3,
        stroke: false,
        fillColor: t.color_hex, // couleur unique de l'espèce
        fillOpacity: 0.85,
      })
        .bindTooltip(
          `${t.essence_fr ?? t.essence_latin}` +
            (t.annee_reference
              ? ` · ${t.annee_reference}` +
                (t.date_source === "releve" ? " (relevé)" : "")
              : ""),
          { direction: "top" },
        )
        .addTo(group);
    }

    group.addTo(map);
    return () => {
      group.remove();
    };
  }, [trees, map]);

  return null;
}

export default function TreeMap({ trees }: { trees: Tree[] }) {
  return (
    <MapContainer
      center={MONTREAL_CENTER}
      zoom={11}
      preferCanvas
      zoomControl
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        url={TILE_URL}
        attribution='&copy; OpenStreetMap &copy; CARTO'
        subdomains="abcd"
      />
      <TreeLayer trees={trees} />
    </MapContainer>
  );
}
