import { useEffect, useMemo, useState } from "react";
import NavBar from "./components/NavBar";
import ControlPanel from "./components/ControlPanel";
import TreeMap from "./components/TreeMap";
import {
  fetchArrondissements,
  fetchSpecies,
  fetchTimeline,
  fetchTrees,
  type Species,
  type Tree,
  type YearPoint,
} from "./api";

export default function App() {
  const [timeline, setTimeline] = useState<YearPoint[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);
  const [arronds, setArronds] = useState<string[]>([]);

  const [year, setYear] = useState<number | null>(null);
  const [arrondissement, setArrondissement] = useState("");

  const [trees, setTrees] = useState<Tree[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  // Chargement initial : référentiels (timeline, espèces, arrondissements).
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      fetchTimeline(ctrl.signal),
      fetchSpecies(8, ctrl.signal),
      fetchArrondissements(ctrl.signal),
    ])
      .then(([tl, sp, ar]) => {
        setTimeline(tl);
        setSpecies(sp);
        setArronds(ar);
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

  // Rechargement des points quand l'année ou l'arrondissement change (debounce).
  useEffect(() => {
    if (year == null) return;
    const ctrl = new AbortController();
    // Pendant la lecture automatique, on charge sans délai pour suivre l'animation.
    const delay = playing ? 0 : 180;
    const timer = setTimeout(() => {
      setLoading(true);
      fetchTrees({ year, arrondissement: arrondissement || undefined }, ctrl.signal)
        .then((res) => {
          setTrees(res.trees);
          setError(null);
        })
        .catch((e: unknown) => {
          if (!(e instanceof DOMException && e.name === "AbortError")) {
            setError("Erreur de chargement des arbres.");
          }
        })
        .finally(() => setLoading(false));
    }, delay);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [year, arrondissement, playing]);

  // Lecture automatique : avance d'année en année jusqu'à la dernière,
  // en 10 s maximum au total. Le bouton Lire devient Stop pendant la lecture.
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
    // Déps volontairement réduites à [playing] : on fige l'année de départ au
    // lancement ; ajouter `year` relancerait l'intervalle à chaque pas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const togglePlay = () => setPlaying((p) => !p);

  const bounds = useMemo(() => {
    if (timeline.length === 0) return { min: 1901, max: 2026 };
    return {
      min: timeline[0].annee,
      max: timeline[timeline.length - 1].annee,
    };
  }, [timeline]);

  const current = useMemo(
    () => timeline.find((p) => p.annee === year) ?? null,
    [timeline, year],
  );

  return (
    <>
      <NavBar />
      <div className="layout">
        <ControlPanel
          year={year ?? bounds.max}
          bounds={bounds}
          onYearChange={setYear}
          arrondissements={arronds}
          arrondissement={arrondissement}
          onArrondChange={setArrondissement}
          playing={playing}
          onTogglePlay={togglePlay}
          canPlay={year != null && year < bounds.max}
          species={species}
          stats={{
            planted: current?.n_arbres ?? null,
            cumul: current?.n_cumule ?? null,
            shown: trees.length,
          }}
        />
        <section id="carte" className="map-wrap">
          {error && <div className="error-banner">{error}</div>}
          <div className={loading ? "loading" : "loading hidden"}>Chargement…</div>
          <TreeMap trees={trees} />
        </section>
      </div>
    </>
  );
}
