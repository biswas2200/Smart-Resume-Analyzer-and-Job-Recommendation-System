"""Splits resume text into named sections by heading detection (FR-1.6), so
local_ner_parser.py can scope the NER model to just Experience and Education
instead of running it over the whole document (dictionary_skills.py still
scans the whole text -- skills can appear anywhere, not just under a "Skills"
heading -- see docs/lld.md §3's sequence diagram).

Resumes with no heading this recognizes fall back to `other` carrying the
entire text unchanged -- exactly today's un-sectioned behavior, so a resume
without clean headings degrades to the pre-step-2 pipeline rather than losing
content the sectioner failed to place.
"""

import re
from dataclasses import dataclass

_HEADING_PATTERNS: dict[str, re.Pattern] = {
    "skills": re.compile(r"^(technical skills|core competencies|skills)\s*:?\s*$", re.IGNORECASE),
    "experience": re.compile(
        r"^(work experience|employment history|professional experience|experience"
        r"|internships?|internship experience)\s*:?\s*$",
        re.IGNORECASE,
    ),
    "education": re.compile(r"^(education|academic background)\s*:?\s*$", re.IGNORECASE),
}
# Headings of sections we don't parse. They only end the section before them,
# so e.g. a "Projects" list after Education is not read as more education. A
# few take any wording after the first word ("Hackathons & Open Source ...").
_OTHER_HEADING = re.compile(
    r"^((academic |personal |key |major )?projects?|certifications?|certificates|courses|(relevant )?coursework"
    r"|achievements|awards?( (and|&) achievements)?|publications|languages|interests|hobbies"
    r"|(extra[- ]?curricular )?activities|volunteering|volunteer experience|references"
    r"|(professional |career )?(summary|profile|objective)"
    r"|(hackathons?|open source|competitive (coding|programming))\b[\w ,&/-]*)\s*:?\s*$",
    re.IGNORECASE,
)
# Longer lines are content, never a heading.
_MAX_HEADING_LENGTH = 60


@dataclass
class Sections:
    skills: str = ""
    experience: str = ""
    education: str = ""
    other: str = ""


def split_sections(text: str) -> Sections:
    """Buckets each line of text under whichever heading most recently
    preceded it. A line before the first recognized heading, a line under a
    heading we don't parse (Projects, Certifications, ...), and every line of
    a resume with none of the Skills / Experience / Education headings, goes
    to `other`.
    """
    buckets: dict[str, list[str]] = {"skills": [], "experience": [], "education": [], "other": []}
    current = "other"
    matched_any = False

    for line in text.splitlines():
        stripped = line.strip()
        if len(stripped) > _MAX_HEADING_LENGTH:
            buckets[current].append(line)
            continue
        matched_section = next(
            (name for name, pattern in _HEADING_PATTERNS.items() if pattern.match(stripped)), None
        )
        if matched_section:
            current = matched_section
            matched_any = True
            continue  # the heading line itself isn't section content
        if _OTHER_HEADING.match(stripped):
            # Ends the section above, but on its own doesn't make the resume
            # "sectioned": with only such headings, everything stays in `other`.
            current = "other"
            continue
        buckets[current].append(line)

    if not matched_any:
        return Sections(other=text)

    return Sections(
        skills="\n".join(buckets["skills"]).strip(),
        experience="\n".join(buckets["experience"]).strip(),
        education="\n".join(buckets["education"]).strip(),
        other="\n".join(buckets["other"]).strip(),
    )
