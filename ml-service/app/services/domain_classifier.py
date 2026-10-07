"""Deterministic job-domain detection for a resume (no LLM, no network):
which entry of data/domains.json the resume belongs to, and therefore which
engine (local / llm) and tier (free / premium) serves it.

Runs for every upload, free or premium, so it must be cheap and must never
call out. Two signals, both already available offline:

1. Dictionary evidence -- canonical skills found in the text against the
   engineering taxonomy (skill_taxonomy.json) and the all-domain one
   (skill_taxonomy_general.json), attributed to the domains whose catalogue
   roles list them. A resume with at least ENGINEERING_MIN_SKILLS engineering
   skills, and no other domain with more dictionary evidence, is engineering
   regardless of the embedding: that guarantees an engineering resume never
   leaves the local, free path because of a noisy embedding, without letting
   the business tools the engineering taxonomy also lists (Excel, Power BI,
   budgeting) pull an accountant's resume onto it.
2. Embedding evidence -- cosine similarity between the resume's opening
   (headline, summary, skills section) and each domain's description, with
   the same pinned MiniLM model the matcher uses.

score = 0.5 * dictionary share + 0.5 * cosine, rounded to 4 dp before the
argmax with a name tie-break (the same drift-proofing as matcher.py). The
reported confidence is the winner's score relative to the runner-up, so
0.5 means "a coin flip", 1.0 means "nothing else came close".
"""

import json
from functools import lru_cache

import numpy as np

from app.config import DATA_DIR
from app.models.schemas import DomainDetection
from app.services import embeddings
from app.services.dictionary_skills import GENERAL_TAXONOMY_PATH, TAXONOMY_PATH, find_skills

DOMAINS_PATH = DATA_DIR / "domains.json"
GENERAL_ROLES_PATH = DATA_DIR / "role_skills_general.json"

ENGINEERING_DOMAIN = "engineering"
ENGINEERING_MIN_SKILLS = 3
# How much of the resume the embedding signal reads: the first N words are
# where headline, summary and the skills block usually sit, and it keeps the
# input inside MiniLM's 256-token window so truncation is not model-dependent.
SNIPPET_WORDS = 200
DICTIONARY_WEIGHT = 0.5
EMBEDDING_WEIGHT = 0.5


@lru_cache
def load_domains() -> list[dict]:
    with open(DOMAINS_PATH, encoding="utf-8") as f:
        return json.load(f)


@lru_cache
def domain_by_id() -> dict[str, dict]:
    return {d["id"]: d for d in load_domains()}


@lru_cache
def _skill_to_domains() -> dict[str, frozenset[str]]:
    """Lowercased canonical skill -> the non-engineering domains whose
    catalogue roles list it (a generic skill like "Customer service" maps to
    several, and is then weak evidence for each -- which is the point)."""
    with open(GENERAL_ROLES_PATH, encoding="utf-8") as f:
        roles: list[dict] = json.load(f)
    mapping: dict[str, set[str]] = {}
    for role in roles:
        for skill in role["skills"]:
            mapping.setdefault(skill.lower(), set()).add(role["domain"])
    return {skill: frozenset(domains) for skill, domains in mapping.items()}


@lru_cache
def _description_vectors() -> dict[str, np.ndarray]:
    domains = load_domains()
    vectors = embeddings.embed([d["description"] for d in domains])
    return {d["id"]: vectors[i] for i, d in enumerate(domains)}


def _snippet(resume_text: str) -> str:
    return " ".join(resume_text.split()[:SNIPPET_WORDS])


def detect_domain(resume_text: str) -> DomainDetection:
    """Classify resume_text into one of data/domains.json's domains."""
    domains = load_domains()
    engineering_hits = find_skills(resume_text, TAXONOMY_PATH)
    general_hits = find_skills(resume_text, GENERAL_TAXONOMY_PATH)
    total_hits = len(engineering_hits) + len(general_hits)

    hits_per_domain: dict[str, int] = {d["id"]: 0 for d in domains}
    hits_per_domain[ENGINEERING_DOMAIN] = len(engineering_hits)
    skill_to_domains = _skill_to_domains()
    for skill in general_hits:
        for domain_id in skill_to_domains.get(skill.lower(), ()):
            if domain_id in hits_per_domain:
                hits_per_domain[domain_id] += 1

    snippet = _snippet(resume_text)
    snippet_vector = embeddings.embed([snippet])[0] if snippet else None
    description_vectors = _description_vectors()

    scores: dict[str, float] = {}
    for d in domains:
        share = hits_per_domain[d["id"]] / total_hits if total_hits else 0.0
        cosine = (
            embeddings.cosine_similarity(snippet_vector, description_vectors[d["id"]])
            if snippet_vector is not None
            else 0.0
        )
        scores[d["id"]] = round(DICTIONARY_WEIGHT * share + EMBEDDING_WEIGHT * max(cosine, 0.0), 4)

    ranked = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    strongest_other = max(
        (n for d, n in hits_per_domain.items() if d != ENGINEERING_DOMAIN), default=0
    )
    if len(engineering_hits) >= ENGINEERING_MIN_SKILLS and len(engineering_hits) >= strongest_other:
        winner_id = ENGINEERING_DOMAIN
    else:
        winner_id = ranked[0][0]
    winner_score = scores[winner_id]
    runner_up = max((s for d, s in scores.items() if d != winner_id), default=0.0)
    denominator = winner_score + runner_up
    confidence = round(winner_score / denominator, 2) if denominator > 0 else 0.0

    domain = domain_by_id()[winner_id]
    return DomainDetection(
        domain=domain["id"],
        name=domain["name"],
        confidence=confidence,
        engine=domain["engine"],
        tier=domain["tier"],
    )
