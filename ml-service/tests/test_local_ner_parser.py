"""Tests local_ner_parser.py -- the zero-external-API resume parsing
backend. Every test here works with hand-built NER entity lists or a fake
pipeline callable, so the suite never downloads or runs the real
yashpwr/resume-ner-bert-v2 model.
"""

from app.services.local_ner_parser import (
    _chunk_text,
    _entities_to_profile,
    parse_resume_local,
)


def _entity(entity_group: str, word: str) -> dict:
    """Build one fake pipeline-output row. start/end aren't used by any of
    the assembly logic under test, so they're left at 0.
    """
    return {"entity_group": entity_group, "word": word, "score": 0.99, "start": 0, "end": 0}


# --- Assembly (_entities_to_profile) --------------------------------------


def test_single_job_entry_groups_correctly():
    entities = [_entity("Designation", "Software Engineer"), _entity("Companies worked at", "Acme Corp")]

    profile = _entities_to_profile(entities, "Software Engineer at Acme Corp")

    assert len(profile.experience) == 1
    assert profile.experience[0].title == "Software Engineer"
    assert profile.experience[0].organization == "Acme Corp"
    assert profile.experience[0].duration == ""
    assert profile.experience[0].description == ""


def test_single_education_entry_groups_correctly():
    entities = [
        _entity("Degree", "B.Tech Computer Science"),
        _entity("College Name", "IIT Bombay"),
        _entity("Graduation Year", "2020"),
    ]

    profile = _entities_to_profile(entities, "B.Tech Computer Science, IIT Bombay, 2020")

    assert len(profile.education) == 1
    assert profile.education[0].degree == "B.Tech Computer Science"
    assert profile.education[0].institution == "IIT Bombay"
    assert profile.education[0].year == "2020"


def test_two_consecutive_jobs_split_into_two_entries():
    entities = [
        _entity("Designation", "Backend Engineer"),
        _entity("Companies worked at", "Acme Corp"),
        _entity("Designation", "Intern"),
        _entity("Companies worked at", "Widgets Inc"),
    ]

    profile = _entities_to_profile(entities, "irrelevant full text")

    assert [e.title for e in profile.experience] == ["Backend Engineer", "Intern"]
    assert [e.organization for e in profile.experience] == ["Acme Corp", "Widgets Inc"]


def test_resume_with_no_education_section_produces_empty_list():
    entities = [_entity("Designation", "Engineer"), _entity("Skills", "Python")]

    profile = _entities_to_profile(entities, "irrelevant full text")

    assert profile.education == []


def test_resume_with_no_experience_section_produces_empty_list():
    entities = [_entity("Degree", "B.Sc"), _entity("Skills", "Python")]

    profile = _entities_to_profile(entities, "irrelevant full text")

    assert profile.experience == []


def test_filler_without_anchor_is_dropped():
    # A stray "College Name" with no preceding "Degree" -- should not
    # produce a spurious EducationEntry with an empty degree.
    entities = [_entity("College Name", "IIT Bombay")]

    profile = _entities_to_profile(entities, "irrelevant full text")

    assert profile.education == []


def test_skills_span_with_commas_gets_split_and_normalized():
    entities = [_entity("Skills", "Python, SQL, Java")]

    profile = _entities_to_profile(entities, "irrelevant full text")

    assert profile.skills == ["Python", "SQL", "Java"]


def test_skills_span_with_slash_delimiter_gets_split():
    entities = [_entity("Skills", "HTML/CSS")]

    profile = _entities_to_profile(entities, "irrelevant full text")

    assert profile.skills == ["HTML", "CSS"]


def test_duplicate_experience_entries_from_chunk_overlap_are_deduped():
    # Simulates the same job appearing twice because it fell inside the
    # overlapping region of two adjacent chunks.
    entities = [
        _entity("Designation", "Engineer"),
        _entity("Companies worked at", "Acme Corp"),
        _entity("Designation", "Engineer"),
        _entity("Companies worked at", "Acme Corp"),
    ]

    profile = _entities_to_profile(entities, "irrelevant full text")

    assert len(profile.experience) == 1


def test_email_extracted_via_regex_takes_priority_over_ner_span():
    entities = [_entity("Email Address", "jane at example dot com")]
    full_text = "Contact: jane.doe@example.com for more info"

    profile = _entities_to_profile(entities, full_text)

    assert profile.email == "jane.doe@example.com"


def test_email_falls_back_to_ner_span_when_regex_finds_none():
    entities = [_entity("Email Address", "jane.doe@example.com")]
    full_text = "Contact: jane dot doe at example dot com"

    profile = _entities_to_profile(entities, full_text)

    assert profile.email == "jane.doe@example.com"


def test_experience_duration_filled_from_nearby_date_range():
    entities = [_entity("Designation", "Software Engineer"), _entity("Companies worked at", "Acme Corp")]
    full_text = "Software Engineer at Acme Corp, Jan 2020 - Mar 2022"

    profile = _entities_to_profile(entities, full_text)

    assert profile.experience[0].duration == "Jan 2020 - Mar 2022"


def test_experience_description_always_empty():
    entities = [_entity("Designation", "Engineer"), _entity("Companies worked at", "Acme Corp")]
    full_text = "Engineer at Acme Corp, Jan 2020 - Mar 2022. Built things."

    profile = _entities_to_profile(entities, full_text)

    assert profile.experience[0].description == ""


def test_unmapped_entity_groups_are_ignored():
    entities = [
        _entity("Years of Experience", "5 years"),
        _entity("Location", "Bengaluru"),
        _entity("UNKNOWN", "???"),
        _entity("Skills", "Python"),
    ]

    profile = _entities_to_profile(entities, "irrelevant full text")

    assert profile.skills == ["Python"]
    assert profile.education == []
    assert profile.experience == []


# --- Chunking (_chunk_text) ------------------------------------------------


def test_chunk_text_splits_long_text_into_overlapping_windows():
    long_text = " ".join(f"word{i}" for i in range(1000))

    chunks = _chunk_text(long_text, max_words=380, overlap_words=50)

    assert len(chunks) > 1
    for chunk in chunks:
        assert len(chunk.split()) <= 380
    # The tail of the first chunk should reappear at the head of the second,
    # proving the overlap actually happened.
    first_words = chunks[0].split()
    second_words = chunks[1].split()
    assert first_words[-50:] == second_words[:50]


def test_chunk_text_returns_single_chunk_for_short_text():
    short_text = "just a few words here"

    chunks = _chunk_text(short_text, max_words=380, overlap_words=50)

    assert chunks == [short_text]


# --- Routing/integration (parse_resume_local) ------------------------------


def test_parse_resume_local_merges_entities_across_chunks():
    calls: list[str] = []

    def fake_pipeline(chunk_text: str) -> list[dict]:
        calls.append(chunk_text)
        if len(calls) == 1:
            return [_entity("Designation", "Engineer")]
        return [_entity("Companies worked at", "Acme Corp")]

    long_text = " ".join(f"word{i}" for i in range(1000))

    profile = parse_resume_local(long_text, ner_pipeline=fake_pipeline)

    assert len(calls) > 1
    assert len(profile.experience) == 1
    assert profile.experience[0].title == "Engineer"
    assert profile.experience[0].organization == "Acme Corp"
