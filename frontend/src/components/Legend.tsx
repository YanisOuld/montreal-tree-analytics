import type { Species } from "../api";

export default function Legend({ species }: { species: Species[] }) {
  if (species.length === 0) {
    return <p style={{ fontSize: 12, color: "var(--muted)" }}>—</p>;
  }
  return (
    <ul className="legend">
      {species.map((s) => (
        <li className="legend-item" key={s.essence_latin}>
          <span
            className="legend-swatch"
            style={{ background: s.display_color }}
          />
          <span className="legend-label" title={s.essence_latin}>
            {s.essence_fr ?? s.essence_latin}
          </span>
          <span className="legend-count">
            {s.n_trees.toLocaleString("fr-CA")}
          </span>
        </li>
      ))}
    </ul>
  );
}
