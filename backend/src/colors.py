"""Attribution d'un code couleur unique à chaque type d'arbre (espèce).

Deux niveaux, pensés pour la carte :

* ``color_hex`` / ``color_hex_dark`` : une couleur **unique et déterministe**
  pour *chaque* espèce (plusieurs centaines). Les teintes sont réparties par
  l'angle d'or pour un espacement maximal, dans une bande de luminosité qui
  reste lisible sur un fond de carte clair (resp. sombre).

* La palette d'affichage : les quelques espèces les plus fréquentes reçoivent
  en plus une couleur issue d'une palette catégorielle validée (sûre pour le
  daltonisme) ; les autres sont regroupées sous « Autres ». C'est ce qu'une
  légende de carte doit utiliser, une couleur par espèce n'étant pas
  distinguable à l'œil au-delà d'une douzaine de catégories.
"""

from __future__ import annotations

import colorsys
from collections.abc import Iterable, Sequence

# Palette catégorielle validée (daltonisme-safe), mode clair puis sombre.
# Source : système de design data-viz de référence, ordre figé.
DISPLAY_PALETTE: list[tuple[str, str]] = [
    ("#2a78d6", "#3987e5"),  # bleu
    ("#eb6834", "#d95926"),  # orange
    ("#1baf7a", "#199e70"),  # aqua
    ("#eda100", "#c98500"),  # jaune
    ("#e87ba4", "#d55181"),  # magenta
    ("#008300", "#008300"),  # vert
    ("#4a3aa7", "#9085e9"),  # violet
    ("#e34948", "#e66767"),  # rouge
]

OTHER_LABEL = "Autres"
OTHER_COLOR = ("#8a8a84", "#9a9a92")  # gris neutre

_GOLDEN_RATIO_CONJUGATE = 0.618033988749895


def _hsl_to_hex(hue: float, sat: float, light: float) -> str:
    r, g, b = colorsys.hls_to_rgb(hue % 1.0, light, sat)
    return "#{:02X}{:02X}{:02X}".format(round(r * 255), round(g * 255), round(b * 255))


def generate_unique_colors(
    keys: Iterable[str],
    *,
    dark: bool = False,
) -> dict[str, str]:
    """Une couleur hex unique et déterministe par clé (espèce).

    L'attribution est faite sur les clés **triées**, donc indépendante de
    l'ordre des lignes : relancer le pipeline redonne exactement les mêmes
    couleurs.
    """
    unique_keys = sorted({k for k in keys if k})

    # Bandes de saturation / luminosité adaptées au fond de carte.
    if dark:
        sat_tiers = [0.70, 0.55, 0.85, 0.62]
        light_tiers = [0.62, 0.70, 0.56, 0.66]
    else:
        sat_tiers = [0.68, 0.85, 0.55, 0.75]
        light_tiers = [0.46, 0.55, 0.40, 0.60]

    mapping: dict[str, str] = {}
    used: set[str] = set()
    hue = 0.11  # décalage initial pour éviter le rouge pur en premier
    for i, key in enumerate(unique_keys):
        hue = (hue + _GOLDEN_RATIO_CONJUGATE) % 1.0
        sat = sat_tiers[i % len(sat_tiers)]
        light = light_tiers[(i // len(sat_tiers)) % len(light_tiers)]

        hex_code = _hsl_to_hex(hue, sat, light)
        # Garantie d'unicité : si collision (très rare), on décale la luminosité.
        nudge = 0
        while hex_code in used:
            nudge += 1
            hex_code = _hsl_to_hex(hue, sat, min(0.92, light + 0.02 * nudge))
        used.add(hex_code)
        mapping[key] = hex_code

    return mapping


def assign_display_palette(
    ranked_keys: Sequence[str],
    *,
    top_n: int = len(DISPLAY_PALETTE),
) -> dict[str, tuple[str, str]]:
    """Palette d'affichage : les ``top_n`` premières clés reçoivent une couleur
    de la palette validée (clair, sombre) ; au-delà, la catégorie « Autres ».

    ``ranked_keys`` doit être ordonné du plus fréquent au moins fréquent.
    """
    top_n = min(top_n, len(DISPLAY_PALETTE))
    mapping: dict[str, tuple[str, str]] = {}
    for i, key in enumerate(ranked_keys):
        if i < top_n:
            mapping[key] = DISPLAY_PALETTE[i]
    return mapping
