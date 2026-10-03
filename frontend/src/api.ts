// Client de l'API Montréal Tree Analytics (proxy Vite -> FastAPI).

export interface Tree {
  id: number;
  longitude: number;
  latitude: number;
  essence_latin: string;
  essence_fr: string | null;
  arrondissement: string | null;
  annee_reference: number | null;
  date_source: "plantation" | "releve" | "inconnue";
  dhp_cm: number | null;
  color_hex: string;
  color_hex_dark: string;
  display_group: string;
  display_color: string;
  display_color_dark: string;
}

export interface Species {
  essence_latin: string;
  sigle: string;
  essence_fr: string | null;
  essence_ang: string | null;
  n_trees: number;
  rank: number;
  color_hex: string;
  color_hex_dark: string;
  display_group: string;
  display_color: string;
  display_color_dark: string;
}

export interface YearPoint {
  annee: number;
  n_arbres: number;
  n_cumule: number;
}

export interface TreesResponse {
  total: number;
  count: number;
  offset: number;
  limit: number;
  trees: Tree[];
}

/** Payload colonnaire compact : tous les points, chargés une seule fois. */
export interface PointsPayload {
  count: number;
  species: { color: string[]; name: string[] }; // indexés par `sp`
  arronds: string[]; // indexés par `arr`
  lon: number[];
  lat: number[];
  annee: number[]; // année de référence (0 = inconnue)
  sp: number[]; // index d'espèce
  arr: number[]; // index d'arrondissement (-1 = inconnu)
  src: number[]; // 0 plantation, 1 relevé, 2 inconnu
}

/** Point prêt à dessiner sur la carte (dérivé côté client). */
export interface MapPoint {
  lat: number;
  lon: number;
  color: string;
  label: string;
}

async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json() as Promise<T>;
}

export const fetchPoints = (signal?: AbortSignal) =>
  getJSON<PointsPayload>("/api/points", signal);

export const fetchTimeline = (signal?: AbortSignal) =>
  getJSON<YearPoint[]>("/api/timeline", signal);

export const fetchSpecies = (limit: number, signal?: AbortSignal) =>
  getJSON<Species[]>(`/api/species?limit=${limit}`, signal);

export const fetchArrondissements = (signal?: AbortSignal) =>
  getJSON<string[]>("/api/arrondissements", signal);

export function fetchTrees(
  params: { year: number; arrondissement?: string; limit?: number },
  signal?: AbortSignal,
): Promise<TreesResponse> {
  const q = new URLSearchParams({
    annee_min: String(params.year),
    annee_max: String(params.year),
    limit: String(params.limit ?? 30000),
  });
  if (params.arrondissement) q.set("arrondissement", params.arrondissement);
  return getJSON<TreesResponse>(`/api/trees?${q.toString()}`, signal);
}
