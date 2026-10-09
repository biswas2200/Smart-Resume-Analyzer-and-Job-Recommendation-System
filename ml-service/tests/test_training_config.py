"""Checks the NER training configuration against the models it names: the
teacher must be the model the app serves, and the student must split text
into exactly the teacher's tokens, or token-by-token distillation compares
mismatched positions."""

import pytest

from app.config import Settings
from training.config import ner_config


def test_teacher_is_the_model_and_revision_the_app_serves():
    # Code defaults, not .env: the pinned values the 60 % / 64 % baselines were measured on.
    fields = Settings.model_fields
    assert ner_config.base_model == fields["ner_model_name"].default
    assert ner_config.base_model_revision == fields["ner_model_revision"].default


def _cached_tokenizer(repo: str, revision: str):
    transformers = pytest.importorskip("transformers")
    try:
        return transformers.AutoTokenizer.from_pretrained(repo, revision=revision, local_files_only=True)
    except OSError:
        pytest.skip(f"{repo} tokenizer not cached on this machine")


def test_student_splits_resume_text_exactly_like_the_teacher():
    teacher = _cached_tokenizer(ner_config.base_model, ner_config.base_model_revision)
    student = _cached_tokenizer(ner_config.student_model, ner_config.student_model_revision)
    text = "Abhishek Jha\nB.Tech - Computer Science, IIT Delhi (2016)\nSAP ABAP | McKinsey & Company | São Paulo"
    assert student.tokenize(text) == teacher.tokenize(text)
    assert student.get_vocab() == teacher.get_vocab()
