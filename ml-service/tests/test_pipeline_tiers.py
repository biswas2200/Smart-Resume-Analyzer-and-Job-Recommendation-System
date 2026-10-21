"""services/pipeline.py -- the domain-engine x caller-tier x allowance cases.
Every model and the LLM are faked: the point here is the routing (which
parser runs, whether the LLM is ever touched, whether and why
recommendations lock, whether a paid extraction is reported), not the
models' output.
"""

import pytest

from app.models.schemas import (
    AtsCheck,
    AtsScoreResponse,
    DomainDetection,
    GapAnalysis,
    ResumeProfile,
    RoleMatch,
)
from app.services import pipeline
from app.services.explainer import Explanation

ENGINEERING = DomainDetection(domain="engineering", name="Engineering & Technology",
                              confidence=0.8, engine="local", tier="free")
HEALTHCARE = DomainDetection(domain="healthcare", name="Healthcare & Life Sciences",
                             confidence=0.8, engine="llm", tier="premium")
ATS = AtsScoreResponse(score=60, max_score=80, checks=[AtsCheck(name="contact_email", passed=True, detail="ok")])


class Calls:
    """Records which seams the pipeline exercised."""

    def __init__(self) -> None:
        self.parse: list[dict] = []
        self.match: list[dict] = []
        self.explain: list[dict] = []


@pytest.fixture
def calls(monkeypatch) -> Calls:
    recorded = Calls()

    def fake_parse(resume_text, client=None, backend=None, domain_name=None):
        recorded.parse.append({"backend": backend, "domain_name": domain_name})
        skills = ["Python", "SQL"] if backend != "llm" else ["Nursing", "Patient Care"]
        return ResumeProfile(name="Sam", skills=skills)

    def fake_match(skills, top_n=5, domain="engineering"):
        recorded.match.append({"skills": skills, "top_n": top_n, "domain": domain})
        return [RoleMatch(role=f"{domain} role", domain=domain, score=0.7,
                          matched_skills=skills[:1], missing_skills=["Other"])]

    def fake_explain(profile, ats, matches, gaps, client=None, backend=None, domain=None, locked=False,
                     lock_reason=None):
        recorded.explain.append({"backend": backend, "locked": locked, "n_matches": len(matches)})
        return Explanation(text=f"{backend}:{'locked' if locked else 'open'}",
                           source="llm" if backend == "llm" and not locked else "template")

    monkeypatch.setattr(pipeline, "parse_resume", fake_parse)
    monkeypatch.setattr(pipeline.matcher, "match_roles", fake_match)
    monkeypatch.setattr(pipeline, "explain_results", fake_explain)
    monkeypatch.setattr(pipeline.ats_score, "score_resume", lambda text, hidden_word_count=0: ATS)
    monkeypatch.setattr(pipeline, "find_skills", lambda text, path=None: [])
    monkeypatch.setattr(pipeline.gap_analysis, "analyze_gaps",
                        lambda matches: [GapAnalysis(role=m.role, missing_skills=m.missing_skills) for m in matches])
    return recorded


def _forbid_llm(monkeypatch):
    from app.services import llm_client

    def boom():
        raise AssertionError("the free tier must never build an LLM client")

    monkeypatch.setattr(llm_client, "get_llm_client", boom)


def test_engineering_free_runs_locally_with_template(monkeypatch, calls):
    monkeypatch.setattr(pipeline, "detect_domain", lambda text: ENGINEERING)
    _forbid_llm(monkeypatch)

    result = pipeline.analyze_text("resume", top_n=3, tier="free")

    assert result.domain == ENGINEERING
    assert result.recommendations_locked is False and result.lock_reason is None
    assert calls.parse == [{"backend": None, "domain_name": None}]
    assert calls.match[0]["domain"] == "engineering" and calls.match[0]["top_n"] == 3
    assert calls.explain == [{"backend": "template", "locked": False, "n_matches": 1}]
    assert result.matches[0].role == "engineering role"
    assert result.explanation_source == "template"


def test_engineering_premium_keeps_local_parse_but_narrates_with_llm(monkeypatch, calls):
    monkeypatch.setattr(pipeline, "detect_domain", lambda text: ENGINEERING)

    result = pipeline.analyze_text("resume", tier="premium")

    assert calls.parse == [{"backend": None, "domain_name": None}]
    assert calls.explain[0]["backend"] == "llm"
    assert result.explanation_source == "llm"
    assert result.recommendations_locked is False


def test_non_engineering_free_without_allowance_is_locked_and_never_touches_the_llm(monkeypatch, calls):
    monkeypatch.setattr(pipeline, "detect_domain", lambda text: HEALTHCARE)
    _forbid_llm(monkeypatch)

    result = pipeline.analyze_text("resume", tier="free")  # llm_allowed defaults to False

    assert result.recommendations_locked is True
    assert result.lock_reason == pipeline.LOCK_REASON_AI_ENGINE_REQUIRED
    assert result.ai_extraction_used is False
    assert result.matches == [] and result.gaps == []
    assert result.ats_score == ATS  # ATS is always computed
    assert result.domain == HEALTHCARE
    assert calls.parse == [{"backend": None, "domain_name": None}]  # local profile card only
    assert calls.match == []
    assert calls.explain == [{"backend": "template", "locked": True, "n_matches": 0}]
    assert result.explanation_source == "template"


def test_non_engineering_premium_extracts_with_llm_and_matches_in_that_domain(monkeypatch, calls):
    monkeypatch.setattr(pipeline, "detect_domain", lambda text: HEALTHCARE)

    result = pipeline.analyze_text("resume", top_n=2, tier="premium")

    assert result.recommendations_locked is False
    assert calls.parse == [{"backend": "llm", "domain_name": "Healthcare & Life Sciences"}]
    assert calls.match == [{"skills": ["Nursing", "Patient Care"], "top_n": 2, "domain": "healthcare"}]
    assert result.matches[0].domain == "healthcare"
    assert calls.explain[0]["backend"] == "llm"
    assert result.explanation_source == "llm"


def test_general_dictionary_hits_are_merged_into_non_engineering_profiles(monkeypatch, calls):
    monkeypatch.setattr(pipeline, "detect_domain", lambda text: HEALTHCARE)
    monkeypatch.setattr(pipeline, "find_skills", lambda text, path=None: ["ACLS", "BLS"])

    locked = pipeline.analyze_text("resume", tier="free")
    unlocked = pipeline.analyze_text("resume", tier="premium")

    assert locked.profile.skills[:2] == ["ACLS", "BLS"]
    assert unlocked.profile.skills[:2] == ["ACLS", "BLS"]
    assert "Nursing" in unlocked.profile.skills


def test_a_local_engine_domain_is_never_locked_whatever_its_tier_label(monkeypatch, calls):
    # Locking is about needing the AI engine, not about the domain's tier
    # label: once a domain runs on the local pipeline it is free for
    # everyone (the label only says where it is *unlimited*).
    local_premium = DomainDetection(domain="legal", name="Legal & Compliance",
                                    confidence=0.7, engine="local", tier="premium")
    monkeypatch.setattr(pipeline, "detect_domain", lambda text: local_premium)
    _forbid_llm(monkeypatch)

    result = pipeline.analyze_text("resume", tier="free")

    assert result.recommendations_locked is False
    assert calls.parse[-1] == {"backend": None, "domain_name": None}  # local engine, no LLM extraction
    assert calls.match[-1]["domain"] == "legal"
    assert result.explanation_source == "template"


# ---------------------------------------------------------------------------
# The free AI allowance (llm_allowed) and the deployment-level locks
# ---------------------------------------------------------------------------


def _record(purpose: str, cache_hit: bool = False) -> None:
    import time
    from app.services import llm_client

    llm_client.ledger.record(llm_client.LLMUsage(
        "gemini", "gemini-2.5-flash-lite", purpose, 0 if cache_hit else 850, 0 if cache_hit else 480,
        0, 0, 0.0 if cache_hit else 0.00028, cache_hit, time.time()))


def test_free_with_allowance_on_an_ai_domain_extracts_once_and_uses_the_template(monkeypatch, calls):
    monkeypatch.setattr(pipeline, "detect_domain", lambda text: HEALTHCARE)
    plain_parse = pipeline.parse_resume

    def parse_and_record(*args, **kwargs):
        if kwargs.get("backend") == "llm":
            _record("extract")
        return plain_parse(*args, **kwargs)

    monkeypatch.setattr(pipeline, "parse_resume", parse_and_record)

    result = pipeline.analyze_text("resume", tier="free", llm_allowed=True)

    assert result.recommendations_locked is False and result.lock_reason is None
    assert calls.parse == [{"backend": "llm", "domain_name": "Healthcare & Life Sciences"}]
    assert calls.match[0]["domain"] == "healthcare"
    assert calls.explain == [{"backend": "template", "locked": False, "n_matches": 1}]  # no paid narrative
    assert result.explanation_source == "template"
    assert result.ai_extraction_used is True
    assert result.llm_usage is not None and result.llm_usage.calls == 1


def test_free_with_allowance_on_engineering_spends_nothing(monkeypatch, calls):
    monkeypatch.setattr(pipeline, "detect_domain", lambda text: ENGINEERING)
    _forbid_llm(monkeypatch)

    result = pipeline.analyze_text("resume", tier="free", llm_allowed=True)

    assert result.recommendations_locked is False
    assert calls.parse == [{"backend": None, "domain_name": None}]
    assert result.ai_extraction_used is False and result.llm_usage is None


def test_a_cached_extraction_does_not_count_as_a_used_ai_analysis(monkeypatch, calls):
    monkeypatch.setattr(pipeline, "detect_domain", lambda text: HEALTHCARE)
    plain_parse = pipeline.parse_resume

    def parse_from_cache(*args, **kwargs):
        _record("extract", cache_hit=True)
        return plain_parse(*args, **kwargs)

    monkeypatch.setattr(pipeline, "parse_resume", parse_from_cache)

    result = pipeline.analyze_text("resume", tier="free", llm_allowed=True)

    assert result.recommendations_locked is False
    assert result.ai_extraction_used is False
    assert result.llm_usage is not None and result.llm_usage.cache_hits == 1


def test_premium_never_reports_a_used_free_analysis_for_the_narrative_alone(monkeypatch, calls):
    monkeypatch.setattr(pipeline, "detect_domain", lambda text: ENGINEERING)
    plain_explain = pipeline.explain_results

    def explain_and_record(*args, **kwargs):
        _record("narrate")
        return plain_explain(*args, **kwargs)

    monkeypatch.setattr(pipeline, "explain_results", explain_and_record)

    result = pipeline.analyze_text("resume", tier="premium")

    assert result.ai_extraction_used is False  # narrate is not an extraction
    assert result.llm_usage is not None and result.llm_usage.details[0].purpose == "narrate"


def test_community_edition_locks_ai_domains_for_everyone_with_its_own_reason(monkeypatch, calls):
    from app.config import get_settings

    monkeypatch.setenv("LLM_PROVIDER", "none")
    get_settings.cache_clear()
    monkeypatch.setattr(pipeline, "detect_domain", lambda text: HEALTHCARE)
    _forbid_llm(monkeypatch)
    try:
        free = pipeline.analyze_text("resume", tier="free", llm_allowed=True)
        premium = pipeline.analyze_text("resume", tier="premium")
    finally:
        get_settings.cache_clear()

    for result in (free, premium):
        assert result.recommendations_locked is True
        assert result.lock_reason == pipeline.LOCK_REASON_COMMUNITY_EDITION
        assert result.matches == [] and result.ats_score == ATS
    assert all(c["backend"] is None for c in calls.parse)  # local profile card only


def test_community_edition_still_serves_engineering_in_full(monkeypatch, calls):
    from app.config import get_settings

    monkeypatch.setenv("LLM_PROVIDER", "none")
    get_settings.cache_clear()
    monkeypatch.setattr(pipeline, "detect_domain", lambda text: ENGINEERING)
    _forbid_llm(monkeypatch)
    try:
        result = pipeline.analyze_text("resume", tier="free")
    finally:
        get_settings.cache_clear()

    assert result.recommendations_locked is False
    assert result.matches[0].role == "engineering role"


def test_daily_budget_guard_locks_the_free_tier_but_not_premium(monkeypatch, calls):
    from app.services import llm_client

    monkeypatch.setattr(llm_client.ledger, "over_daily_budget", lambda: True)
    monkeypatch.setattr(pipeline, "detect_domain", lambda text: HEALTHCARE)

    free = pipeline.analyze_text("resume", tier="free", llm_allowed=True)
    premium = pipeline.analyze_text("resume", tier="premium")

    assert free.recommendations_locked is True
    assert free.lock_reason == pipeline.LOCK_REASON_AI_BUDGET_EXHAUSTED
    assert premium.recommendations_locked is False
    assert calls.parse[-1]["backend"] == "llm"  # premium still extracted


def test_llm_usage_is_attached_only_when_the_analysis_called_an_llm(monkeypatch, calls):
    import time
    from app.services import llm_client

    monkeypatch.setattr(pipeline, "detect_domain", lambda text: ENGINEERING)

    free = pipeline.analyze_text("text", tier="free")
    assert free.llm_usage is None

    plain_explain = pipeline.explain_results

    def explain_and_record_usage(*args, **kwargs):
        llm_client.ledger.record(llm_client.LLMUsage(
            "gemini", "gemini-2.5-flash", "narrate", 450, 300, 0, 0, 0.000885, False, time.time()))
        return plain_explain(*args, **kwargs)

    monkeypatch.setattr(pipeline, "explain_results", explain_and_record_usage)

    premium = pipeline.analyze_text("text", tier="premium")
    assert premium.llm_usage is not None
    assert premium.llm_usage.calls == 1
    assert premium.llm_usage.details[0].purpose == "narrate"
    assert premium.llm_usage.estimated_cost_usd == pytest.approx(0.000885)


def test_analysis_logs_its_outcome_but_not_the_resume(monkeypatch, calls, caplog):
    monkeypatch.setattr(pipeline, "detect_domain", lambda text: ENGINEERING)
    _forbid_llm(monkeypatch)

    with caplog.at_level("INFO", logger="app.services.pipeline"):
        pipeline.analyze_text("Jane Doe jane@example.com", tier="free")

    line = caplog.records[-1].getMessage()
    assert "domain=engineering" in line and "engine=local" in line and "matches=1" in line
    assert "Jane" not in line and "jane@example.com" not in line
