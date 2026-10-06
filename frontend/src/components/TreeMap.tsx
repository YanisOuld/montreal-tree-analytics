import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import type { PointsPayload } from "../api";

const MONTREAL_CENTER: [number, number] = [45.55, -73.65];

// Clé CARTO Basemaps (retire le filigrane « API key required »).
// Définie dans frontend/.env (non versionné) -> VITE_CARTO_KEY.
const CARTO_KEY = import.meta.env.VITE_CARTO_KEY ?? "";
const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" +
  (CARTO_KEY ? `?key=${CARTO_KEY}` : "");

const CELL = 4; // taille de cellule (px) pour l'index de survol

/**
 * Couche canvas unique dessinant les points depuis les tableaux (pas un objet
 * par point) : passe à l'échelle jusqu'à des centaines de milliers de points.
 * - projection mise en cache par niveau de zoom (recalcul au zoom seulement) ;
 * - points dessinés en carrés (style rectangulaire) ;
 * - survol via un index de cellules construit pendant le dessin.
 */
function PointsCanvas({ data, idx }: { data: PointsPayload; idx: number[] }) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const projX = useRef<Float32Array>(new Float32Array(0));
  const projY = useRef<Float32Array>(new Float32Array(0));
  const bucket = useRef<Int32Array>(new Int32Array(0));
  const colsRef = useRef(0);
  const drawRef = useRef<() => void>(() => {});
  const dataRef = useRef(data);
  const idxRef = useRef(idx);
  dataRef.current = data;
  idxRef.current = idx;

  // Création de la couche + gestion des événements (une fois).
  useEffect(() => {
    const canvas = L.DomUtil.create(
      "canvas",
      "leaflet-zoom-hide",
    ) as HTMLCanvasElement;
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    map.getPanes().overlayPane.appendChild(canvas);
    canvasRef.current = canvas;

    const tip = L.DomUtil.create("div", "map-tip");
    tip.style.display = "none";
    map.getContainer().appendChild(tip);
    tipRef.current = tip;

    const computeProjection = () => {
      const { lat, lon, count } = dataRef.current;
      const xs = new Float32Array(count);
      const ys = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const p = map.latLngToLayerPoint([lat[i], lon[i]]);
        xs[i] = p.x;
        ys[i] = p.y;
      }
      projX.current = xs;
      projY.current = ys;
    };

    const draw = () => {
      const canvas_ = canvasRef.current;
      if (!canvas_) return;
      const size = map.getSize();
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas_, topLeft);
      if (canvas_.width !== size.x || canvas_.height !== size.y) {
        canvas_.width = size.x;
        canvas_.height = size.y;
      }
      const ctx = canvas_.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, size.x, size.y);

      const cols = Math.ceil(size.x / CELL);
      const rows = Math.ceil(size.y / CELL);
      colsRef.current = cols;
      if (bucket.current.length !== cols * rows) {
        bucket.current = new Int32Array(cols * rows);
      }
      bucket.current.fill(-1);

      const xs = projX.current;
      const ys = projY.current;
      const { sp, species } = dataRef.current;
      const ids = idxRef.current;
      let lastSp = -1;
      for (let k = 0; k < ids.length; k++) {
        const i = ids[k];
        const x = xs[i] - topLeft.x;
        const y = ys[i] - topLeft.y;
        if (x < 0 || y < 0 || x >= size.x || y >= size.y) continue;
        const s = sp[i];
        if (s !== lastSp) {
          ctx.fillStyle = species.color[s] ?? "#888";
          lastSp = s;
        }
        ctx.fillRect(x - 1, y - 1, 3, 3);
        bucket.current[((y / CELL) | 0) * cols + ((x / CELL) | 0)] = i;
      }
    };
    drawRef.current = draw;

    const onZoomEnd = () => {
      computeProjection();
      draw();
    };
    const onMove = () => draw();

    map.on("zoomend", onZoomEnd);
    map.on("moveend resize", onMove);
    map.on("move", onMove);

    const onMouseMove = (e: MouseEvent) => {
      const tip_ = tipRef.current;
      if (!tip_) return;
      const rect = map.getContainer().getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cell =
        ((y / CELL) | 0) * colsRef.current + ((x / CELL) | 0);
      const i = bucket.current[cell];
      if (i >= 0 && i < dataRef.current.count) {
        const d = dataRef.current;
        const annee = d.annee[i];
        const label =
          (d.species.name[d.sp[i]] ?? "—") +
          (annee > 0 ? ` · planté en ${annee}` : "");
        tip_.textContent = label;
        tip_.style.display = "block";
        tip_.style.left = `${x + 12}px`;
        tip_.style.top = `${y + 12}px`;
      } else {
        tip_.style.display = "none";
      }
    };
    const onMouseOut = () => {
      if (tipRef.current) tipRef.current.style.display = "none";
    };
    const container = map.getContainer();
    container.addEventListener("mousemove", onMouseMove);
    container.addEventListener("mouseout", onMouseOut);

    computeProjection();
    draw();

    return () => {
      map.off("zoomend", onZoomEnd);
      map.off("moveend resize", onMove);
      map.off("move", onMove);
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("mouseout", onMouseOut);
      canvas.remove();
      tip.remove();
    };
  }, [map]);

  // Redessine quand les données ou le sous-ensemble visible changent.
  useEffect(() => {
    drawRef.current();
  }, [data, idx]);

  return null;
}

export default function TreeMap({
  data,
  idx,
}: {
  data: PointsPayload | null;
  idx: number[];
}) {
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
        attribution="&copy; OpenStreetMap &copy; CARTO"
        subdomains="abcd"
      />
      {data && <PointsCanvas data={data} idx={idx} />}
    </MapContainer>
  );
}
