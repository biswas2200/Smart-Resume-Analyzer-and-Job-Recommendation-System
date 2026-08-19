"""Note: matcher.py loads a sentence-transformers model on first use, which
requires downloading model weights the first time it's run on a machine
(then caches locally). These tests need network access for that first
download; they are otherwise deterministic and need no API key.
"""

from app.services.matcher import match_roles


def test_backend_skills_match_backend_role_highest():
    matches = match_roles(
        ["Java", "Spring Boot", "SQL", "REST APIs", "Docker", "Microservices"],
        top_n=3,
    )
    assert matches[0].role == "Backend Software Engineer"
    assert matches[0].score >= matches[-1].score


def test_matched_and_missing_skills_partition_role_requirements():
    matches = match_roles(["Figma", "User Research", "Wireframing"], top_n=1)
    top = matches[0]
    assert top.role == "UX/UI Designer"
    assert set(top.matched_skills) <= {"Figma", "User Research", "Wireframing", "Prototyping", "Interaction Design", "Usability Testing"}
    assert "Prototyping" in top.missing_skills


def test_top_n_limits_result_count():
    matches = match_roles(["Python"], top_n=2)
    assert len(matches) == 2
