"""Deterministic skill-to-role matching: embed the candidate's normalized
skill set and each curated role's required-skill set, then rank roles by
cosine similarity. Classic content-based filtering — no LLM involved, so the
score is reproducible and each match can be explained via matched/missing
skill lists.
"""

import json
from functools import lru_cache

import numpy as np

from app.config import DATA_DIR
from app.models.schemas import RoleMatch
from app.services import embeddings
from app.services.normalizer import normalize_skills

ROLE_SKILLS_PATH = DATA_DIR / "role_skills.json"


@lru_cache
def _load_roles() -> list[dict]:
    with open(ROLE_SKILLS_PATH, encoding="utf-8") as f:
        roles: list[dict] = json.load(f)
    for role in roles:
        role["skills"] = normalize_skills(role["skills"])
    return roles


@lru_cache
def _role_vector(role_name: str) -> np.ndarray:
    roles = {r["role"]: r["skills"] for r in _load_roles()}
    skills = roles[role_name]
    vectors = embeddings.embed(skills)
    return vectors.mean(axis=0)


def _skill_set_vector(skills: list[str]) -> np.ndarray:
    if not skills:
        return np.zeros(1)
    vectors = embeddings.embed(skills)
    return vectors.mean(axis=0)


def match_roles(raw_skills: list[str], top_n: int = 5) -> list[RoleMatch]:
    """Rank every curated role against raw_skills by cosine similarity of
    their mean skill-embedding vectors, returning the top_n highest-scoring
    matches with their matched/missing skill breakdown.
    """
    candidate_skills = normalize_skills(raw_skills)
    candidate_set = set(candidate_skills)
    candidate_vector = _skill_set_vector(candidate_skills)

    scored: list[RoleMatch] = []
    for role in _load_roles():
        role_skills = role["skills"]
        role_vector = _role_vector(role["role"])

        score = embeddings.cosine_similarity(candidate_vector, role_vector)
        matched = [s for s in role_skills if s in candidate_set]
        missing = [s for s in role_skills if s not in candidate_set]

        scored.append(
            RoleMatch(
                role=role["role"],
                score=round(score, 4),
                matched_skills=matched,
                missing_skills=missing,
            )
        )

    scored.sort(key=lambda m: m.score, reverse=True)
    return scored[:top_n]
