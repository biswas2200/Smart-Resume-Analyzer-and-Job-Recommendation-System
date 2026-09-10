"""Tests the deterministic rule-based checks in ats_score.py."""

from app.services.ats_score import score_resume

GOOD_RESUME = """
Jane Doe
jane.doe@example.com | +1 (555) 123-4567

Skills
Python, SQL, REST APIs, Docker, Git

Experience
Backend Engineer, Acme Corp, 2022-2024
Built and maintained REST APIs serving millions of requests per day, owned
the deployment pipeline, and mentored two junior engineers on the team.

Education
B.S. Computer Science, State University, 2022
""" * 2

SPARSE_RESUME = "John. No contact info. No sections. Just a few words."


def test_good_resume_scores_high():
    result = score_resume(GOOD_RESUME)
    assert result.score >= 0.8 * result.max_score
    passed_checks = {c.name for c in result.checks if c.passed}
    assert {"contact_email", "contact_phone", "section_experience", "section_education", "section_skills"} <= passed_checks


def test_sparse_resume_scores_low():
    result = score_resume(SPARSE_RESUME)
    assert result.score < 0.3 * result.max_score
    failed_checks = {c.name for c in result.checks if not c.passed}
    assert "contact_email" in failed_checks
    assert "section_experience" in failed_checks


def test_keyword_coverage_adds_to_max_score_only_when_provided():
    without_keywords = score_resume(GOOD_RESUME)
    with_keywords = score_resume(GOOD_RESUME, target_keywords=["Python", "Kubernetes"])
    assert with_keywords.max_score == without_keywords.max_score + 20.0
    assert any(c.name == "keyword_coverage" for c in with_keywords.checks)
