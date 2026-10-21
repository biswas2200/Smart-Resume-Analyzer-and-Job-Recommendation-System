"""Local, zero-external-API resume parsing. Runs a resume-specialized NER
model (by default our fine-tune of yashpwr/resume-ner-bert, loaded from
models/ner/teacher-run1; see Settings.ner_model_name) fully offline -- no API key, no outbound
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

import hashlib
import logging
import re
import shutil
import time
from functools import lru_cache
from pathlib import Path
from typing import Callable

from app.config import SERVICE_DIR, get_settings
from app.models.schemas import EducationEntry, ExperienceEntry, ResumeProfile
from app.services.dictionary_skills import find_skills
from app.services.normalizer import normalize_skills
from app.services.sectioner import split_sections

# One row of transformers.pipeline("token-classification", ...) output with
# aggregation_strategy="simple": {"entity_group": str, "word": str,
# "score": float, "start": int, "end": int}. Kept as a plain dict (not a
# TypedDict/dataclass) since we only ever read two of its keys here.
NerEntity = dict

logger = logging.getLogger(__name__)

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
#
# _PHONE_RE's first branch is the Indian mobile written as two groups of
# five ("+91 98765 43210"), which the 3/4-digit grouping of the second
# branch can't split; it requires the separator, so a bare ten-digit run
# still goes to the second branch.
_PHONE_RE = re.compile(
    r"(?:\+?\d{1,3}[-.\s]?)?(?:\d{5}[-.\s]\d{5}|\(?\d{3,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4})"
)

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

# A standalone 4-digit year, e.g. the "2017" in "...engineering\n\nAugust
# 2013 to June 2017" or a bare "2016" on its own line. The NER model is
# weak at "Graduation Year" on real resumes (21% token F1 across the 220
# ground-truth resumes in ml-service/scripts/evaluate_ner_extraction.py), so
# this fallback is the main signal for the field, not a refinement.
_YEAR_RE = re.compile(r"(?:19|20)\d{2}")

# Entities the model is less confident about than this are dropped before
# assembly. Measured, 0.0 (keep everything) is best: on half of the 220
# annotated resumes, macro F1 over the profile fields was 70% at 0.0, 66%
# at 0.4 and 39% at 0.6 -- once entities are aggregated per word ("first",
# see _get_ner_pipeline) the low-confidence tail is mostly real, partially
# tagged titles/companies, not noise. Kept as a knob for a future model.
_MIN_ENTITY_SCORE = 0.0

# An education-section line naming an institution. Word-bounded so e.g.
# "schooling" doesn't count; the short acronyms cover the Indian institute
# names common in the annotated data (IIT Bombay, NIT Trichy, ...).
_INSTITUTION_KEYWORD_RE = re.compile(
    r"\b(?:university|college|institute|institution|school|academy|vidyalaya|polytechnic|iit|nit|iiit|bits)\b",
    re.IGNORECASE,
)
# Separators between the degree, institution and place on one line. The
# dashes include the en/em dash and the full-width "－" that some resume
# builders (e.g. LiveCareer exports) put between institution and city.
_INSTITUTION_SEPARATOR_RE = re.compile(r"\s+[-–—－|]\s+|\s+:\s+|,|\t")

# _extract_name: how far down to look, what a name line looks like (2-4
# words of letters -- any script, so "José García" counts -- plus dots,
# apostrophes and hyphens), and words that mark a heading or a job title
# rather than a person. `[^\W\d_]` is "a letter" in Python's re.
_NAME_SEARCH_LINES = 3
_NAME_WORD = r"[^\W\d_](?:[^\W\d_]|[.'-])*"
_NAME_LINE_RE = re.compile(rf"{_NAME_WORD}(?: {_NAME_WORD}){{1,3}}")
_NOT_NAME_WORDS = {
    "resume", "curriculum", "vitae", "cv", "profile", "biodata", "summary", "objective", "contact",
    "experience", "education", "skills", "details", "personal",
    "engineer", "developer", "manager", "analyst", "consultant", "designer", "associate", "intern",
    "specialist", "executive", "officer", "lead", "architect", "administrator", "scientist", "director",
}


def parse_resume_local(
    resume_text: str, ner_pipeline: Callable[[str], list[NerEntity]] | None = None
) -> ResumeProfile:
    """Parse resume_text into a ResumeProfile using the local NER model. Runs
    the model per-chunk (see _chunk_text) since it has a 512-token limit, and
    merges every chunk's entities before assembling the profile. Pass
    ner_pipeline to inject a fake in tests -- the real model is only built
    (and only then does it need to be installed/downloaded) if this is left
    as None.

    FR-1.6/1.7: the NER model only ever sees the Experience and Education
    sections (split_sections), which is both cheaper and more accurate than
    running it over the whole document -- skills are instead found by
    deterministic dictionary matching over the *whole* text
    (dictionary_skills.find_skills) and merged with whatever "Skills" entity
    spans the NER pass happens to also produce, for recall. A resume with no
    heading this sectioner recognizes falls back to feeding the NER model
    the whole text, unchanged from the pre-step-2 pipeline.
    """
    pipeline_fn = ner_pipeline or _get_ner_pipeline()
    sections = split_sections(resume_text)
    ner_text = (
        f"{sections.experience}\n{sections.education}".strip()
        if (sections.experience or sections.education)
        else resume_text
    )

    entities: list[NerEntity] = []
    for chunk in _chunk_text(ner_text):
        entities.extend(_with_source_text(pipeline_fn(chunk), chunk))

    profile = _entities_to_profile(entities, resume_text)
    profile.skills = normalize_skills([*find_skills(resume_text), *profile.skills])
    profile.education = _fill_education_years(profile.education, sections.education)
    profile.education = _fill_education_institutions(profile.education, sections.education)
    return profile


@lru_cache(maxsize=1)
def _get_ner_pipeline() -> Callable[[str], list[NerEntity]]:
    """Lazily build and cache the real transformers NER pipeline. Imported
    inside the function (not at module load time) so that importing this
    module -- and injecting a fake pipeline in tests -- never requires
    `transformers` to actually download the model.
    """
    from transformers import pipeline

    settings = get_settings()
    # "first" aggregates per *word* (each word takes the label of its first
    # subword token). "simple" aggregated per subword token, so a word whose
    # subwords got different labels was split into fragments like "##ance"
    # that then became their own degree/company records.
    # revision= loads exactly the commit engine_fingerprint() hashes
    # (fingerprint.py); without it the fingerprint named a pinned revision
    # while the pipeline silently loaded whatever was on "main". A local
    # directory has no commits, so its pin is the weights' SHA-256 instead.
    local_dir = resolve_local_model_dir(settings.ner_model_name)
    if local_dir is not None:
        verify_local_model(local_dir, settings.ner_model_revision)
        logger.info("Loading NER model from %s (sha256 %s)", local_dir, settings.ner_model_revision[:12])
        return pipeline("token-classification", model=str(local_dir), aggregation_strategy="first")
    logger.info("Loading NER model %s@%s", settings.ner_model_name, settings.ner_model_revision[:12])
    return pipeline(
        "token-classification",
        model=settings.ner_model_name,
        revision=settings.ner_model_revision,
        aggregation_strategy="first",
    )


def resolve_local_model_dir(name: str) -> Path | None:
    """The directory `name` refers to, if it is a saved model on disk (a
    relative path is taken from ml-service/), else None for a hub id. A name
    that looks like a path but does not exist raises, so a missing download
    fails at start-up instead of silently querying the hub for "models/...".
    """
    path = _local_model_path(name)
    if path is not None and path.is_dir():
        return path
    if path is not None and name.startswith(("models/", "./", "/")):
        raise FileNotFoundError(
            f"NER model directory {path} not found. Set NER_MODEL_GCS_URI to download it at "
            "start-up, or run scripts/fetch_ner_models.sh first."
        )
    return None


def ensure_local_model(settings) -> None:
    """At start-up: when the NER model is a local folder that is missing and
    NER_MODEL_GCS_URI names its copy in the bucket, download it with ADC.
    The files land in a staging folder, are checked against the pinned
    SHA-256, and only then take the model folder's place, so a failed or
    tampered download never becomes the model. Does nothing for a hub id,
    an existing folder, or the LLM parser.
    """
    if settings.parser_backend != "local" or not settings.ner_model_gcs_uri:
        return
    path = _local_model_path(settings.ner_model_name)
    if path is None or path.is_dir():
        return

    from app.services.gcs_download import download_folder

    staging = path.parent / f".{path.name}.download"
    logger.info("NER model %s missing; downloading %s", path, settings.ner_model_gcs_uri)
    start = time.perf_counter()
    try:
        count = download_folder(settings.ner_model_gcs_uri, staging)
        verify_local_model(staging, settings.ner_model_revision)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    staging.rename(path)
    logger.info("Downloaded the NER model (%d files) in %.0fs", count, time.perf_counter() - start)


def _local_model_path(name: str) -> Path | None:
    """Where `name` would live on disk (relative paths are taken from
    ml-service/), or None when it reads as a Hugging Face id."""
    path = Path(name)
    if path.is_absolute():
        return path
    path = SERVICE_DIR / path
    if path.is_dir() or name.startswith(("models/", "./")):
        return path
    return None


def verify_local_model(model_dir: Path, expected_sha256: str) -> None:
    """Refuse weights other than the pinned ones: the engine fingerprint
    names the pin, so loading anything else would make it lie."""
    digest = hashlib.sha256()
    with open(model_dir / "model.safetensors", "rb") as weights:
        for block in iter(lambda: weights.read(1 << 20), b""):
            digest.update(block)
    actual = digest.hexdigest()
    if actual != expected_sha256:
        raise ValueError(
            f"{model_dir}/model.safetensors has SHA-256 {actual}, but NER_MODEL_REVISION pins {expected_sha256}."
        )


def _with_source_text(entities: list[NerEntity], chunk: str) -> list[NerEntity]:
    """Each entity's text as it is written in the resume. The pipeline's
    "word" is rebuilt from subword tokens, which puts spaces around
    punctuation ("Technical Lead / Operations Manager" for
    "Technical Lead/Operations Manager"), so the same title would not match
    itself. The entity's character offsets into the chunk give the original
    text; runs of whitespace inside it (a span across a line break) become
    one space. Entities without usable offsets keep their "word".
    """
    fixed = []
    for entity in entities:
        start, end = entity.get("start"), entity.get("end")
        if isinstance(start, int) and isinstance(end, int) and 0 <= start < end <= len(chunk):
            entity = {**entity, "word": " ".join(chunk[start:end].split())}
        fixed.append(entity)
    return fixed


# Each whitespace-delimited word *with* the whitespace that follows it, so a
# chunk can be rebuilt with the original newlines intact.
_WORD_WITH_TRAILING_SPACE_RE = re.compile(r"\S+\s*")


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

    Chunks keep the original whitespace, including newlines: line breaks are
    one of the strongest signals in a resume (a title or company is usually
    on a line of its own), and joining words with single spaces used to
    flatten every long resume into one line before the model saw it.
    """
    words = _WORD_WITH_TRAILING_SPACE_RE.findall(text)
    if len(words) <= max_words:
        return [text]

    chunks = []
    start = 0
    while start < len(words):
        end = min(start + max_words, len(words))
        chunks.append("".join(words[start:end]).rstrip())
        if end == len(words):
            break
        start = end - overlap_words
    return chunks


def _apply_education_entity(group: str, text: str, current_edu: dict | None, education: list[dict]) -> dict | None:
    """Handles one "Degree" (anchor) or education-filler entity, returning
    what should become the new current_edu. A filler with no anchor open
    yet (e.g. a stray "College Name" before any "Degree") is dropped rather
    than starting a placeholder record -- an empty-degree row would just be
    noise, most likely from a model misfire (the model is ~49% token F1 on real
    resumes, far from perfect).
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


def _entities_to_profile(
    entities: list[NerEntity], full_text: str, min_score: float = _MIN_ENTITY_SCORE
) -> ResumeProfile:
    """Assemble a ResumeProfile from a flat, already-in-document-order list
    of NER entities. Pure function (no model, no I/O) so tests can exercise
    every grouping/edge case with hand-built entity lists. Entities the
    model is less than min_score confident about are dropped first.
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
        if not text or float(entity.get("score", 1.0)) < min_score:
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
        name=_extract_name(full_text) or (name_spans[0] if name_spans else ""),
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


def _fill_education_years(education: list[EducationEntry], education_section_text: str) -> list[EducationEntry]:
    """Best-effort fill of each still-empty EducationEntry.year from
    standalone 4-digit years found in the isolated Education section text
    (see sectioner.py), assigned positionally -- the i-th unconsumed year in
    that text fills the i-th entry still missing a year -- rather than by
    matching each entry's degree/institution text back into the original
    resume the way _fill_experience_durations does for job titles. That
    approach doesn't transfer here: an entity's reconstructed text (e.g.
    "b college of engineering and technology" for what was actually
    "B.v.b college...") is built from subword tokens and routinely doesn't
    `.find()` back into the original text at all, so proximity-to-anchor
    isn't a reliable signal for this field the way it is for a job title.
    Scoped to the Education section alone (not the whole resume) so a job's
    own date range is never mistaken for a graduation year.
    """
    if not education_section_text:
        return education

    years = iter(_YEAR_RE.findall(education_section_text))
    for entry in education:
        if entry.year:
            continue
        year = next(years, None)
        if year is None:
            break
        entry.year = year

    return education


def _institution_in_line(line: str) -> str:
    """The part of one education-section line that names an institution, or
    "" if it doesn't look like one. A line like "B.E, Anna University,
    Chennai" is split on its separators and only the piece carrying the
    keyword is kept, so the degree isn't repeated in the institution field.
    """
    for piece in _INSTITUTION_SEPARATOR_RE.split(line):
        piece = piece.strip(" .")
        if _INSTITUTION_KEYWORD_RE.search(piece):
            return piece
    return ""


def _fill_education_institutions(
    education: list[EducationEntry], education_section_text: str
) -> list[EducationEntry]:
    """Best-effort fill of each still-empty EducationEntry.institution from
    lines of the Education section that name an institution (a keyword such
    as "University", "College" or "Institute"), assigned positionally like
    _fill_education_years. The NER model misses many institutions on real
    resumes (52% token F1 on "College Name"), and on the DataTurks held-out half this fallback lifts institution
    F1 from 49% to 63%.

    When the model folded the institution into the degree span (e.g. degree
    "Bachelor of Engg in IT Shivaji University Kolhapur"), the institution
    is trimmed off the end of the degree once it has its own field.
    """
    if not education_section_text:
        return education

    institutions = iter(
        found for line in education_section_text.splitlines() if (found := _institution_in_line(line))
    )
    for entry in education:
        if entry.institution:
            continue
        institution = next(institutions, None)
        if institution is None:
            break
        entry.institution = institution
        if entry.degree.lower().endswith(institution.lower()) and len(entry.degree) > len(institution):
            entry.degree = entry.degree[: -len(institution)].strip(" ,-|")

    return education


def _extract_name(text: str) -> str:
    """The candidate's name, taken from the first few non-empty lines of the
    resume, or "" if none of them looks like a name. Resumes put the name on
    the first line nearly always, but when headings are present the NER
    model never sees the top of the resume (see parse_resume_local), so it
    can't tag the name there. With this rule, name F1 on the DataTurks
    held-out half is 97% (the NER path alone: 5%).

    A line counts as a name when it is 2-4 capitalised words of letters only
    and contains none of the words that mark a heading or a job title
    ("Resume", "Experience", "Engineer", ...).
    """
    lines = (" ".join(line.split()) for line in text.splitlines())
    for line in [line for line in lines if line][:_NAME_SEARCH_LINES]:
        words = line.split(" ")
        if not _NAME_LINE_RE.fullmatch(line):
            continue
        if any(word.lower().strip(".") in _NOT_NAME_WORDS for word in words):
            continue
        if all(word[0].isupper() for word in words):
            return line
    return ""


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
