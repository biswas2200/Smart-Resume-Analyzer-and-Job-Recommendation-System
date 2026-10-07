"""Tests the skill filter of scripts/build_general_catalogue.py: posting
boilerplate, background checks, application documents and degrees never become
skills, while real skills, specific credentials and soft skills survive."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from build_general_catalogue import clean_skill  # noqa: E402


@pytest.mark.parametrize(
    "junk",
    [
        "13 weeks", "Guaranteed Hours", "Paid training", "Relocation to Madison WI", "12hour shifts",
        "Sick pay", "Career growth opportunities", "Criminal Records Check", "Working with Children Check",
        "U.S. Citizenship", "Clean driving record", "Active license", "State licensing exam",
        "Transcripts", "Teaching Philosophy", "PhD", "Doctor of Medicine", "AVMA accredited college",
        "Vomiting/diarrhea", "MLS membership",
    ],
)
def test_non_skills_are_rejected(junk):
    assert clean_skill(junk) is None


@pytest.mark.parametrize(
    "skill",
    [
        "CPR", "CPA license", "PMP Certification", "Series 7", "Real estate license", "ISO 9001",
        "AutoCAD Civil 3D", "Primavera P6", "Communication", "Heavy lifting", "Contract Management",
        "Shift Supervisor", "Portfolio Management", "Registered Nurse",
    ],
)
def test_real_skills_and_credentials_are_kept(skill):
    assert clean_skill(skill) == skill
