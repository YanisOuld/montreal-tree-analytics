import type { LegendEntry } from "../api";
import type { ViewMode } from "../App";
import Legend from "./Legend";

interface Props {
  year: number;
  bounds: { min: number; max: number };
  onYearChange: (y: number) => void;
  arrondissements: string[];
  arrondissement: string;
  onArrondChange: (a: string) => void;
  mode: ViewMode;
  onModeChange: (m: ViewMode) => void;
  playing: boolean;
  onTogglePlay: () => void;
  canPlay: boolean;
  legend: LegendEntry[];
  stats: {
    planted: number | null;
    cumul: number | null;
    shown: number | null;
    noDate: number | null;
  };
}

function fmt(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("fr-CA");
}

export default function ControlPanel({
  year,
  bounds,
  onYearChange,
  arrondissements,
  arrondissement,
  onArrondChange,
  mode,
  onModeChange,
  playing,
  onTogglePlay,
  canPlay,
  legend,
  stats,
}: Props) {
  return (
    <aside className="panel">
      <section className="panel-block">
        <h2 className="panel-title">Mode d'affichage</h2>
        <div className="segmented">
          <button
            className={mode === "annee" ? "seg active" : "seg"}
            onClick={() => onModeChange("annee")}
          >
            Par année
          </button>
          <button
            className={mode === "cumul" ? "seg active" : "seg"}
            onClick={() => onModeChange("cumul")}
          >
            Cumulé
          </button>
        </div>
      </section>

      <section className="panel-block">
        <h2 className="panel-title">Année de plantation</h2>
        <div className="year-readout">{year}</div>
        <input
          className="slider"
          type="range"
          min={bounds.min}
          max={bounds.max}
          step={1}
          value={year}
          onChange={(e) => onYearChange(Number(e.target.value))}
        />
        <div className="slider-bounds">
          <span>{bounds.min}</span>
          <span>{bounds.max}</span>
        </div>
        <button
          className={playing ? "btn-play playing" : "btn-play"}
          onClick={onTogglePlay}
          disabled={!playing && !canPlay}
        >
          {playing ? "■ Stop" : "▶ Lire l'évolution"}
        </button>
      </section>

      <section className="panel-block stats">
        <div className="stat">
          <span className="stat-label">Plantés en {year}</span>
          <span className="stat-value">{fmt(stats.planted)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Cumul jusqu'en {year}</span>
          <span className="stat-value">{fmt(stats.cumul)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Affichés sur la carte</span>
          <span className="stat-value">{fmt(stats.shown)}</span>
        </div>
        {stats.noDate != null && stats.noDate > 0 && (
          <div className="stat stat-muted">
            <span className="stat-label">Sans date de plantation</span>
            <span className="stat-value">{fmt(stats.noDate)}</span>
          </div>
        )}
      </section>

      <section className="panel-block">
        <h2 className="panel-title">Arrondissement</h2>
        <select
          className="select"
          value={arrondissement}
          onChange={(e) => onArrondChange(e.target.value)}
        >
          <option value="">Tous</option>
          {arrondissements.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </section>

      <section className="panel-block">
        <h2 className="panel-title">Essences principales</h2>
        <Legend items={legend} />
      </section>
    </aside>
  );
}
