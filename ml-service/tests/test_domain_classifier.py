"""domain_classifier.detect_domain(): deterministic, offline, and biased so
that an engineering resume can never leave the local/free path. The
embedding model is stubbed with a tiny bag-of-words vectoriser so the tests
need no model download and run in milliseconds.
"""

import zlib

import numpy as np
import pytest

from app.services import domain_classifier, embeddings

ENGINEERING_RESUME = """
Jane Doe -- Backend Software Engineer
Summary: 5 years building REST APIs and microservices.
Skills: Java, Spring Boot, Python, SQL, Docker, Kubernetes, Git
Experience
Backend Engineer, Acme Corp, 2019-2024
"""

NURSING_RESUME = """
Maria Lopez, RN
Registered Nurse with 6 years of acute care experience.
Skills: Nursing, Patient Care, Medication Administration, ACLS, BLS, Patient Education
Experience
Registered Nurse, City Hospital, 2018-2024
"""

ACCOUNTING_RESUME = """
Sam Patel, CPA
Senior Accountant experienced in financial reporting.
Skills: Accounting, Financial Reporting, GAAP, General Ledger, Journal Entries, Financial Statements
Experience
Staff Accountant, Ledger & Co, 2017-2024
"""


def _bag_of_words_embed(texts: list[str]) -> np.ndarray:
    """Deterministic stand-in for MiniLM: hashed bag-of-words, L2-normalised.
    crc32 rather than hash(): str hashing is salted per process, which made
    near-tie cases flip between runs."""
    vectors = np.zeros((len(texts), 64))
    for i, text in enumerate(texts):
        for word in text.lower().split():
            vectors[i, zlib.crc32(word.encode()) % 64] += 1.0
        norm = np.linalg.norm(vectors[i])
        if norm:
            vectors[i] /= norm
    return vectors


@pytest.fixture(autouse=True)
def _stub_embeddings(monkeypatch):
    monkeypatch.setattr(embeddings, "embed", _bag_of_words_embed)
    domain_classifier._description_vectors.cache_clear()
    yield
    domain_classifier._description_vectors.cache_clear()


def test_engineering_resume_is_engineering_free_local():
    detection = domain_classifier.detect_domain(ENGINEERING_RESUME)

    assert detection.domain == "engineering"
    assert detection.engine == "local"
    assert detection.tier == "free"
    assert 0.5 <= detection.confidence <= 1.0


def test_nursing_resume_is_healthcare_premium_llm():
    detection = domain_classifier.detect_domain(NURSING_RESUME)

    assert detection.domain == "healthcare"
    assert detection.name == "Healthcare & Life Sciences"
    assert detection.engine == "llm"
    assert detection.tier == "premium"


def test_accounting_resume_is_finance():
    assert domain_classifier.detect_domain(ACCOUNTING_RESUME).domain == "finance_accounting"


def test_three_engineering_skills_force_engineering_unless_another_domain_has_more_evidence():
    # Three engineering skills on an otherwise thin resume: engineering,
    # whatever the embedding says.
    thin = "Sam Roe\nSkills: Python, SQL, Docker\nOpen to opportunities."
    assert domain_classifier.detect_domain(thin).domain == "engineering"

    # The same three on a nursing resume do not outvote six healthcare
    # skills: a nurse who scripts reports is still a nurse.
    text = NURSING_RESUME + "\nAlso familiar with Python, SQL and Docker for reporting."
    assert domain_classifier.detect_domain(text).domain == "healthcare"

    text_two = NURSING_RESUME + "\nAlso familiar with Python and SQL."
    assert domain_classifier.detect_domain(text_two).domain == "healthcare"


def test_business_tools_in_the_engineering_taxonomy_do_not_capture_an_accountant():
    # Excel, Power BI and Budgeting are engineering-taxonomy skills too; a
    # finance resume that lists them stays finance.
    text = ACCOUNTING_RESUME + "\nTools: Excel, Power BI, Budgeting, Forecasting, Variance Analysis"
    assert domain_classifier.detect_domain(text).domain == "finance_accounting"


def test_detection_is_deterministic():
    first = domain_classifier.detect_domain(ACCOUNTING_RESUME)
    second = domain_classifier.detect_domain(ACCOUNTING_RESUME)

    assert first == second


def test_empty_text_still_returns_a_domain_with_zero_confidence():
    detection = domain_classifier.detect_domain("")

    assert detection.domain in domain_classifier.domain_by_id()
    assert detection.confidence == 0.0


def test_every_domain_has_engine_and_tier():
    for domain in domain_classifier.load_domains():
        assert domain["engine"] in {"local", "llm"}
        assert domain["tier"] in {"free", "premium"}
    engineering = domain_classifier.domain_by_id()["engineering"]
    assert (engineering["engine"], engineering["tier"]) == ("local", "free")


# ---------------------------------------------------------------------------
# The ten Premium domains added 2026-09-14 -- above all, non-IT engineers must
# never land on the software pipeline (or in construction trades / design).
# ---------------------------------------------------------------------------

MECHANICAL_RESUME = """
Arjun Mehta -- Mechanical Engineer, 5 years in automotive component design.
Skills: SolidWorks, AutoCAD, GD&T, FEA, ANSYS, DFMEA, CATIA, Injection Moulding, Tolerance Analysis
Experience
Design Engineer, Tata Motors, 2019-2024
"""
CIVIL_RESUME = """
Priya Nair -- Civil Engineer (Structural), 6 years on highway and bridge projects.
Skills: STAAD Pro, AutoCAD Civil 3D, Structural Analysis, Reinforced Concrete Design, Site Supervision, Primavera P6
Experience
Site Engineer, L&T Construction, 2018-2024
"""
ELECTRICAL_RESUME = """
Rohan Das -- Electrical Engineer, power distribution and substation design.
Skills: ETAP, Power Systems, Switchgear, Protection Relays, PLC, SCADA, Transformer Sizing, Load Flow Analysis
Experience
Electrical Engineer, Siemens, 2017-2024
"""
PROCESS_RESUME = """
Neha Singh -- Process Engineer in a petrochemical refinery.
Skills: Chemical Engineering, Process Design, Aspen HYSYS, Process Simulation, P&ID, HAZOP, Distillation, Process Safety Management
Experience
Process Engineer, Reliance Industries, 2016-2024
"""


@pytest.mark.parametrize("resume", [MECHANICAL_RESUME, CIVIL_RESUME, ELECTRICAL_RESUME, PROCESS_RESUME])
def test_non_it_engineers_are_core_engineering_not_software(resume):
    detection = domain_classifier.detect_domain(resume)

    assert detection.domain == "core_engineering"
    assert (detection.engine, detection.tier) == ("llm", "premium")


@pytest.mark.parametrize("resume, expected", [
    ("Vikram Rao -- Quality Engineer.\nSkills: Root Cause Analysis, Six Sigma, ISO 9001, PPAP, SPC, Quality Inspection, Calipers\n"
     "Experience\nQuality Engineer, Bosch, 2018-2024", "quality_safety"),
    ("Kavya Menon -- PMP Project Manager.\nSkills: Project Management, Risk Management, Stakeholder Management, Budgeting, Scheduling, PMP\n"
     "Experience\nProgram Manager, Infosys BPM, 2016-2024", "consulting_project_management"),
    ("Deepak Kumar -- Store Manager.\nSkills: Retail Management, Merchandising, Inventory Management, Store Management, Loss Prevention\n"
     "Experience\nStore Manager, Reliance Retail, 2017-2024", "retail_ecommerce"),
    ("Anjali Das -- Licensed Social Worker.\nSkills: Case Management, Social Work, Crisis Intervention, Advocacy, Counseling, Treatment Planning\n"
     "Experience\nCase Manager, CRY, 2018-2024", "social_services"),
    ("Suresh Pillai -- Relationship Banker.\nSkills: Banking, Underwriting, Loan Origination, Risk Assessment, Retail Banking, NMLS\n"
     "Experience\nUniversal Banker, HDFC Bank, 2016-2024", "banking_insurance"),
    ("Dr. Meera Shah -- Small animal veterinarian.\nSkills: Veterinary Medicine, Surgery, Animal Care, Ultrasound, Dentistry\n"
     "Experience\nVeterinarian, Cessna Lifeline, 2019-2024", "veterinary_agriculture"),
    ("Ravi Yadav -- Production Supervisor.\nSkills: Production Supervision, Lean Manufacturing, Continuous Improvement, Production Planning, Machine Operation\n"
     "Experience\nProduction Supervisor, Bajaj Auto, 2015-2024", "manufacturing_production"),
    ("Nisha Verma -- Property Manager.\nSkills: Property Management, Leasing, Rent Collection, Yardi, Resident Relations, Vendor Management\n"
     "Experience\nAssistant Property Manager, Godrej Properties, 2018-2024", "real_estate_property"),
    ("Dr. Karan Bose -- Research Scientist.\nSkills: Molecular Biology, Biochemistry, Cell Culture, Flow Cytometry, HPLC, ELISA, Immunology\n"
     "Experience\nResearch Associate, NCBS, 2017-2024", "science_research"),
])
def test_each_new_premium_domain_wins_its_own_resume(resume, expected):
    assert domain_classifier.detect_domain(resume).domain == expected


def test_the_catalogue_covers_every_llm_domain():
    from app.services import matcher

    for domain in domain_classifier.load_domains():
        if domain["engine"] == "llm":
            assert len(matcher._roles_in(domain["id"])) >= 8, domain["id"]
