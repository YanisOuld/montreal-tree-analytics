import { useEffect, useMemo, useState } from "react";
import NavBar from "./components/NavBar";
import ControlPanel from "./components/ControlPanel";
import TreeMap from "./components/TreeMap";
import {
  fetchPoints,
  fetchSpecies,
  fetchTimeline,
  type PointsPayload,
  type Species,
  type YearPoint,
} from "./api";

export type ViewMode = "annee" | "cumul";

export default function App() {
  const [points, setPoints] = useState<PointsPayload | null>(null);
  const [timeline, setTimeline] = useState<YearPoint[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);

  const [year, setYear] = useState<number | null>(null);
  const [arrondissement, setArrondissement] = useState("");
  const [mode, setMode] = useState<ViewMode>("annee");
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chargement initial unique : tous les points (colonnaire + gzip) + référentiels.
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      fetchPoints(ctrl.signal),
      fetchTimeline(ctrl.signal),
      fetchSpecies(8, ctrl.signal),
    ])
      .then(([pts, tl, sp]) => {
        setPoints(pts);
        setTimeline(tl);
        setSpecies(sp);
        if (tl.length > 0) setYear(tl[tl.length - 1].annee);
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

  const bounds = useMemo(() => {
    if (timeline.length === 0) return { min: 1901, max: 2026 };
    return { min: timeline[0].annee, max: timeline[timeline.length - 1].annee };
  }, [timeline]);

  const current = useMemo(
    () => timeline.find((p) => p.annee === year) ?? null,
    [timeline, year],
  );

  const visibleIdx = useMemo<number[]>(() => {
    if (!points || year == null) return [];
    const arrIdx = arrondissement ? points.arronds.indexOf(arrondissement) : -1;
    const { annee, arr, count } = points;
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      const a = annee[i];
      const match =
        mode === "cumul" ? a > 0 && a <= year : a === year;
      if (!match) continue;
      if (arrIdx >= 0 && arr[i] !== arrIdx) continue;
      out.push(i);
    }
    return out;
  }, [points, year, arrondissement, mode]);

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
          species={species}
          stats={{
            planted: current?.n_arbres ?? null,
            cumul: current?.n_cumule ?? null,
            shown: visibleIdx.length,
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
