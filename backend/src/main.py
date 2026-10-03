"""Point d'entrée : transforme les données brutes des arbres en couche gold.

Usage :
    uv run python src/main.py
"""

import gold


def main() -> None:
    print("Transformation raw -> gold en cours...")
    stats = gold.run_pipeline()
    print("Terminé. Artefacts écrits dans data/gold/ :")
    print(f"  - trees.parquet            : {stats['arbres']:>7} arbres "
          f"({stats['arbres_geolocalises']} géolocalisés)")
    print(f"  - species_colors.csv       : {stats['especes']:>7} espèces "
          f"(une couleur unique par type)")
    print(f"  - annual_counts.parquet    : {stats['annees']:>7} années")


if __name__ == "__main__":
    main()
