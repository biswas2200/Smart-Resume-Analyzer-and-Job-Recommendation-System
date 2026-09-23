"""Local, zero-external-API resume parsing. Runs a resume-specialized NER
model (yashpwr/resume-ner-bert-v2, downloaded from Hugging Face once and
cached locally by transformers) fully offline -- no API key, no outbound
network call per request, no per-request cost. This is the default parsing
backend (see Settings.parser_backend in app/config.py); parser.py falls back
to the LLM-based path only when explicitly configured to.

The model tags flat entity spans (one BIO-tagged label per token) with no
signal about which spans belong to the same job/degree, and no entity type
at all for a job's date range or free-text description. This module's job is
turning that flat, incomplete signal into a best-effort ResumeProfile -- the
assembly logic below documents each heuristic and its known limitations
inline, since the tradeoffs are the interesting/non-obvious part of this
file.
"""

import re
from functools import lru_cache
from typing import Callable

from app.config import get_settings
from app.models.schemas import EducationEntry, ExperienceEntry, ResumeProfile
from app.services.normalizer import normalize_skills

# One row of transformers.pipeline("token-classification", ...) output with
# aggregation_strategy="simple": {"entity_group": str, "word": str,
# "score": float, "start": int, "end": int}. Kept as a plain dict (not a
# TypedDict/dataclass) since we only ever read two of its keys here.
NerEntity = dict

# "Degree"/"Designation" are anchors: each occurrence signals a new
# education/experience record is starting (matches the common one-line/
# one-bullet-per-degree-or-job resume convention). The other groups below
# are attributes that fill in whichever anchor record is currently open --
# they never start a new record on their own.
_EDUCATION_FILLER_FIELDS = {"College Name": "institution", "Graduation Year": "year"}
_EXPERIENCE_FILLER_FIELDS = {"Companies worked at": "organization"}

# Splits a single "Skills" entity span (which often tags a whole
# comma/slash-separated list as one span, e.g. "Python, SQL, Java") into
# individual skill strings before they're handed to normalize_skills().
_SKILL_DELIMITER_RE = re.compile(r"[,/|;•\n]+|\band\b", re.IGNORECASE)

# Deliberately simple, not exhaustive -- these two exist as a more reliable
# alternative to the model's own Email Address/Phone tags for the common
# case; the NER tags are still used as a fallback (see _entities_to_profile)
# for formatting the regexes miss.
#
# _EMAIL_RE's local part and domain are each exactly one unbounded character
# class, never two adjacent/nested ones -- this runs on user-uploaded resume
# text, so avoiding any backtracking-blowup shape matters more than
# rejecting a domain with no dot in it (an edge case this lenient,
# heuristic check doesn't need to catch anyway).
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+")
_PHONE_RE = re.compile(r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}")

# Matches date ranges like "Jan 2020 - Mar 2022", "2019-2021",
# "Jun 2021 to Present". There is no NER entity for a job's duration at all,
# so this is the only signal available for ExperienceEntry.duration.
_MONTH = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+"
_DATE_TOKEN = rf"(?:{_MONTH})?\d{{4}}"
_DATE_END_TOKEN = rf"(?:(?:{_MONTH})?\d{{4}}|[Pp]resent|[Cc]urrent)"
_DATE_RANGE_RE = re.compile(rf"{_DATE_TOKEN}\s*(?:-|–|—|to)\s*{_DATE_END_TOKEN}")

# A date match more than this many characters away from a job's title
# position is considered unrelated rather than guessed at -- better to leave
# duration blank than to attach a clearly-wrong nearby date.
_MAX_DATE_MATCH_DISTANCE_CHARS = 300


def parse_resume_local(
    resume_text: str, ner_pipeline: Callable[[str], list[NerEntity]] | None = None
) -> ResumeProfile:
    """Parse resume_text into a ResumeProfile using the local NER model. Runs
    the model per-chunk (see _chunk_text) since it has a 512-token limit, and
    merges every chunk's entities before assembling the profile. Pass
    ner_pipeline to inject a fake in tests -- the real model is only built
    (and only then does it need to be installed/downloaded) if this is left
    as None.
    """
    pipeline_fn = ner_pipeline or _get_ner_pipeline()
    entities: list[NerEntity] = []
    for chunk in _chunk_text(resume_text):
        entities.extend(pipeline_fn(chunk))
    return _entities_to_profile(entities, resume_text)


@lru_cache(maxsize=1)
def _get_ner_pipeline() -> Callable[[str], list[NerEntity]]:
    """Lazily build and cache the real transformers NER pipeline. Imported
    inside the function (not at module load time) so that importing this
    module -- and injecting a fake pipeline in tests -- never requires
    `transformers` to actually download the model.
    """
    from transformers import pipeline

    settings = get_settings()
    return pipeline(
        "token-classification",
        model=settings.ner_model_name,
        aggregation_strategy="simple",
    )


def _chunk_text(text: str, max_words: int = 380, overlap_words: int = 50) -> list[str]:
    """Split text into overlapping word-count windows so each chunk stays
    safely under the model's 512-subword-token limit. Word count (not a real
    tokenizer call) is a conservative proxy -- English text averages under
    1.3 BERT subword tokens per word, so 380 words leaves real margin. The
    overlap means a section straddling a hard chunk boundary very likely
    appears whole in at least one of the two overlapping chunks; the
    resulting duplicate entities near the boundary are handled by
    _dedupe_records() rather than by reconciling chunk offsets, since nothing
    downstream needs the entities' position in the *original* document.
    """
    words = text.split()
    if len(words) <= max_words:
        return [text]

    chunks = []
    start = 0
    while start < len(words):
        end = min(start + max_words, len(words))
        chunks.append(" ".join(words[start:end]))
        if end == len(words):
            break
        start = end - overlap_words
    return chunks


def _apply_education_entity(group: str, text: str, current_edu: dict | None, education: list[dict]) -> dict | None:
    """Handles one "Degree" (anchor) or education-filler entity, returning
    what should become the new current_edu. A filler with no anchor open
    yet (e.g. a stray "College Name" before any "Degree") is dropped rather
    than starting a placeholder record -- an empty-degree row would just be
    noise, most likely from a model misfire (90.87% F1, not 100%).
    """
    if group == "Degree":
        if current_edu is not None:
            education.append(current_edu)
        return {"degree": text, "institution": "", "year": ""}
    if current_edu is not None:
        current_edu[_EDUCATION_FILLER_FIELDS[group]] = text
    return current_edu


def _apply_experience_entity(group: str, text: str, current_exp: dict | None, experience: list[dict]) -> dict | None:
    """Handles one "Designation" (anchor) or experience-filler entity,
    returning what should become the new current_exp. Same drop-if-no-anchor
    behavior as _apply_education_entity, for the same reason.
    """
    if group == "Designation":
        if current_exp is not None:
            experience.append(current_exp)
        return {"title": text, "organization": "", "duration": "", "description": ""}
    if current_exp is not None:
        current_exp[_EXPERIENCE_FILLER_FIELDS[group]] = text
    return current_exp


def _entities_to_profile(entities: list[NerEntity], full_text: str) -> ResumeProfile:
    """Assemble a ResumeProfile from a flat, already-in-document-order list
    of NER entities. Pure function (no model, no I/O) so tests can exercise
    every grouping/edge case with hand-built entity lists.
    """
    education: list[dict] = []
    experience: list[dict] = []
    current_edu: dict | None = None
    current_exp: dict | None = None
    education_groups = {"Degree", *_EDUCATION_FILLER_FIELDS}
    experience_groups = {"Designation", *_EXPERIENCE_FILLER_FIELDS}
    simple_spans = {"Skills": [], "Email Address": [], "Phone": [], "Name": []}

    for entity in entities:
        group = entity.get("entity_group", "")
        text = str(entity.get("word", "")).strip()
        if not text:
            continue

        if group in education_groups:
            current_edu = _apply_education_entity(group, text, current_edu, education)
        elif group in experience_groups:
            current_exp = _apply_experience_entity(group, text, current_exp, experience)
        elif group in simple_spans:
            simple_spans[group].append(text)
        # "Years of Experience", "Location", "UNKNOWN" (and anything else
        # the model emits) are intentionally not mapped to any
        # ResumeProfile field -- a known local-path gap, not a bug.

    skill_spans = simple_spans["Skills"]
    email_spans = simple_spans["Email Address"]
    phone_spans = simple_spans["Phone"]
    name_spans = simple_spans["Name"]

    if current_edu is not None:
        education.append(current_edu)
    if current_exp is not None:
        experience.append(current_exp)

    education = _dedupe_records(education, ("degree", "institution"))
    experience = _dedupe_records(experience, ("title", "organization"))
    experience = _fill_experience_durations(experience, full_text)
    # experience[*]["description"] is intentionally left "" -- there is no
    # NER entity for free-text description, and unlike duration, no regex is
    # safe/general enough across resume layouts (bullets, tables,
    # multi-column PDF-as-text) to guess at it without risking pulling in
    # unrelated content (e.g. the next job's title). Users who need this
    # field can opt into the LLM parsing backend instead.

    return ResumeProfile(
        name=name_spans[0] if name_spans else "",
        email=_extract_email(full_text) or (email_spans[0] if email_spans else ""),
        phone=_extract_phone(full_text) or (phone_spans[0] if phone_spans else ""),
        skills=normalize_skills(_split_skill_spans(skill_spans)),
        experience=[ExperienceEntry(**entry) for entry in experience],
        education=[EducationEntry(**entry) for entry in education],
    )


def _dedupe_records(records: list[dict], key_fields: tuple[str, ...]) -> list[dict]:
    """Drop later records whose key_fields match one already seen (case-
    insensitive), preserving first-seen order. Needed because overlapping
    chunks (see _chunk_text) can cause the same real job/degree to be
    emitted twice by the NER pass.
    """
    seen: set[tuple[str, ...]] = set()
    deduped = []
    for record in records:
        key = tuple(record[field].strip().lower() for field in key_fields)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(record)
    return deduped


def _nearest_unconsumed_match_index(matches: list[re.Match], consumed: list[bool], title_pos: int) -> int | None:
    """Index of the not-yet-consumed match in matches closest to title_pos,
    or None if every match is either already consumed or farther away than
    _MAX_DATE_MATCH_DISTANCE_CHARS.
    """
    best_index = None
    best_distance = None
    for index, match in enumerate(matches):
        if consumed[index]:
            continue
        distance = abs(match.start() - title_pos)
        if distance > _MAX_DATE_MATCH_DISTANCE_CHARS:
            continue
        if best_distance is None or distance < best_distance:
            best_distance = distance
            best_index = index
    return best_index


def _fill_experience_durations(experience: list[dict], full_text: str) -> list[dict]:
    """Best-effort fill of each experience entry's duration by matching it
    to the nearest not-yet-used date-range match in the surrounding text.
    Heuristic, not exact: proximity-based matching can misattribute a date
    when the same job title appears more than once in the resume, or when a
    job's date range is written far from its title. Leaves duration "" when
    no match is close enough (see _MAX_DATE_MATCH_DISTANCE_CHARS) rather
    than guessing.
    """
    matches = list(_DATE_RANGE_RE.finditer(full_text))
    consumed = [False] * len(matches)

    for entry in experience:
        title_pos = full_text.find(entry["title"]) if entry["title"] else -1
        if title_pos == -1:
            continue

        best_index = _nearest_unconsumed_match_index(matches, consumed, title_pos)
        if best_index is not None:
            consumed[best_index] = True
            entry["duration"] = matches[best_index].group(0)

    return experience


def _split_skill_spans(spans: list[str]) -> list[str]:
    """Split each raw "Skills" entity span on common list delimiters. Only
    does splitting/trimming -- normalize_skills() (reused, not reimplemented)
    already handles lowercasing, taxonomy mapping, and de-duplication.
    """
    pieces = []
    for span in spans:
        for piece in _SKILL_DELIMITER_RE.split(span):
            piece = piece.strip(" .")
            if piece:
                pieces.append(piece)
    return pieces


def _extract_email(text: str) -> str:
    """Return the first regex-matched email address in text, or "" if none."""
    match = _EMAIL_RE.search(text)
    return match.group(0) if match else ""


def _extract_phone(text: str) -> str:
    """Return the first regex-matched phone number in text, or "" if none."""
    match = _PHONE_RE.search(text)
    return match.group(0) if match else ""
