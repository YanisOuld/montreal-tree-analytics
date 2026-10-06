import type { LegendEntry } from "../api";

export default function Legend({ items }: { items: LegendEntry[] }) {
  if (items.length === 0) {
    return <p style={{ fontSize: 12, color: "var(--muted)" }}>—</p>;
  }
  return (
    <ul className="legend">
      {items.map((e, i) => (
        <li className="legend-item" key={`${e.name}-${i}`}>
          <span className="legend-swatch" style={{ background: e.color }} />
          <span className="legend-label" title={e.name}>
            {e.name}
          </span>
          <span className="legend-count">{e.n.toLocaleString("fr-CA")}</span>
        </li>
      ))}
    </ul>
  );
}
