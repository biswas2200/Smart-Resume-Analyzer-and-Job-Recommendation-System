"""Deterministic skill normalization — maps raw skill strings to a canonical
taxonomy. No LLM involved: this is a plain lookup table, kept explainable and
reproducible so match scores can be traced back to exact skill matches.
"""

import json
from functools import lru_cache

from app.config import DATA_DIR

TAXONOMY_PATH = DATA_DIR / "skill_taxonomy.json"


@lru_cache
def _variant_to_canonical() -> dict[str, str]:
    with open(TAXONOMY_PATH, encoding="utf-8") as f:
        canonical_to_variants: dict[str, list[str]] = json.load(f)

    lookup: dict[str, str] = {}
    for canonical, variants in canonical_to_variants.items():
        lookup[canonical.strip().lower()] = canonical
        for variant in variants:
            lookup[variant.strip().lower()] = canonical
    return lookup


def normalize_skill(raw_skill: str) -> str:
    """Map a single raw skill string to its canonical form. Skills not found
    in the taxonomy are returned title-cased and unchanged otherwise, since
    they may be legitimate skills the taxonomy hasn't been curated for yet.
    """
    key = raw_skill.strip().lower()
    if not key:
        return ""
    return _variant_to_canonical().get(key, raw_skill.strip())


def normalize_skills(raw_skills: list[str]) -> list[str]:
    """Normalize a list of raw skill strings, de-duplicating while
    preserving first-seen order.
    """
    seen: set[str] = set()
    result: list[str] = []
    for raw in raw_skills:
        normalized = normalize_skill(raw)
        if normalized and normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result
