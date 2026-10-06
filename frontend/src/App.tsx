import { useEffect, useMemo, useState } from "react";
import NavBar from "./components/NavBar";
import ControlPanel from "./components/ControlPanel";
import TreeMap from "./components/TreeMap";
import {
  fetchPoints,
  type LegendEntry,
  type PointsPayload,
} from "./api";

export type ViewMode = "annee" | "cumul";

export default function App() {
  const [points, setPoints] = useState<PointsPayload | null>(null);

  const [year, setYear] = useState<number | null>(null);
  const [arrondissement, setArrondissement] = useState("");
  const [mode, setMode] = useState<ViewMode>("annee");
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chargement initial unique : tous les points (colonnaire + gzip).
  useEffect(() => {
    const ctrl = new AbortController();
    fetchPoints(ctrl.signal)
      .then((pts) => {
        setPoints(pts);
        let mx = -Infinity;
        for (let i = 0; i < pts.count; i++) {
          if (pts.annee[i] > mx) mx = pts.annee[i];
        }
        if (mx > 0) setYear(mx);
      })
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setError(
            "Impossible de contacter l'API. Lancer le backend : " +
              "uv run uvicorn api:app --app-dir src",
          );
        }
      });
    return () => ctrl.abort();
  }, []);

  // Lecture automatique : avance d'année en année jusqu'à la dernière, en 10 s
  // maximum au total. Le bouton Lire devient Stop pendant la lecture.
  useEffect(() => {
    if (!playing || year == null) return;
    const end = bounds.max;
    if (year >= end) {
      setPlaying(false);
      return;
    }
    const steps = end - year; // année de départ figée au lancement
    const stepMs = Math.min(700, 10000 / steps);
    let current = year;
    const id = setInterval(() => {
      current += 1;
      setYear(current);
      if (current >= end) {
        clearInterval(id);
        setPlaying(false);
      }
    }, stepMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const togglePlay = () => setPlaying((p) => !p);

  // Bornes du slider = min/max des années de plantation connues.
  const bounds = useMemo(() => {
    if (!points) return { min: 1901, max: 2026 };
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = 0; i < points.count; i++) {
      const a = points.annee[i];
      if (a > 0) {
        if (a < mn) mn = a;
        if (a > mx) mx = a;
      }
    }
    return {
      min: Number.isFinite(mn) ? mn : 1901,
      max: Number.isFinite(mx) ? mx : 2026,
    };
  }, [points]);

  // Statistiques recalculées selon les filtres actifs (année, arrondissement).
  const stats = useMemo(() => {
    if (!points || year == null) {
      return { planted: 0, cumul: 0, noDate: 0 };
    }
    const arrIdx = arrondissement ? points.arronds.indexOf(arrondissement) : -1;
    const { annee, arr, count } = points;
    let planted = 0;
    let cumul = 0;
    let noDate = 0;
    for (let i = 0; i < count; i++) {
      if (arrIdx >= 0 && arr[i] !== arrIdx) continue;
      const a = annee[i];
      if (a <= 0) {
        noDate++;
        continue;
      }
      if (a === year) planted++;
      if (a <= year) cumul++;
    }
    return { planted, cumul, noDate };
  }, [points, year, arrondissement]);

  // Indices visibles sur la carte selon le mode (année exacte / cumulé) + filtre.
  const visibleIdx = useMemo<number[]>(() => {
    if (!points || year == null) return [];
    const arrIdx = arrondissement ? points.arronds.indexOf(arrondissement) : -1;
    const { annee, arr, count } = points;
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      const a = annee[i];
      const match = mode === "cumul" ? a > 0 && a <= year : a === year;
      if (!match) continue;
      if (arrIdx >= 0 && arr[i] !== arrIdx) continue;
      out.push(i);
    }
    return out;
  }, [points, year, arrondissement, mode]);

  // Légende recalculée selon le filtre : top 8 espèces parmi les points visibles,
  // avec leur couleur unique et leur effectif filtré.
  const legend = useMemo<LegendEntry[]>(() => {
    if (!points) return [];
    const counts = new Map<number, number>();
    for (const i of visibleIdx) {
      const s = points.sp[i];
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([s, n]) => ({
        name: points.species.name[s] ?? "—",
        color: points.species.color[s] ?? "#888",
        n,
      }));
  }, [points, visibleIdx]);

  return (
    <>
      <NavBar />
      <div className="layout">
        <ControlPanel
          year={year ?? bounds.max}
          bounds={bounds}
          onYearChange={setYear}
          arrondissements={points?.arronds ?? []}
          arrondissement={arrondissement}
          onArrondChange={setArrondissement}
          mode={mode}
          onModeChange={setMode}
          playing={playing}
          onTogglePlay={togglePlay}
          canPlay={year != null && year < bounds.max}
          legend={legend}
          stats={{
            planted: stats.planted,
            cumul: stats.cumul,
            shown: visibleIdx.length,
            noDate: stats.noDate,
          }}
        />
        <section id="carte" className="map-wrap">
          {error && <div className="error-banner">{error}</div>}
          <div className={points ? "loading hidden" : "loading"}>
            Chargement des données…
          </div>
          <TreeMap data={points} idx={visibleIdx} />
        </section>
      </div>
    </>
  );
}
