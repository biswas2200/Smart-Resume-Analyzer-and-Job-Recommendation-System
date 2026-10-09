"""Scores NER models the way the app uses them: each model is plugged into the
app's parser (local_ner_parser.parse_resume_local), and the profile it
produces is compared field by field with human labels. This is the harness
the 60 % and 64 % baselines were measured with, so a trained model is
compared like for like, and the base model is re-scored in the same run.

    cd ml-service
    python -m training.evaluate_model --datasets-dir ../datasets OUT/teacher OUT/student
    # the app's current model is always included as the baseline

Sets:
  - DataTurks test: resumes 111 to 220, never trained on. Six fields.
  - Unseen LiveCareer: the 20 hand-labelled resumes in eval-unseen/, excluded
    from the training pool. Four fields; names and employers are anonymised there.
A value counts as found when either string contains the other (the rule of
scripts/evaluate_ner_extraction.py). Macro F1 is the mean over the fields;
skills are reported but not in the macro, as for the baselines.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from evaluate_ner_extraction import _contains_either, ground_truth_by_label  # noqa: E402

from training.config import ner_config  # noqa: E402

TURKS_FIELDS = {
    "Name": ("Name", lambda p: [p.name] if p.name else []),
    "Degree": ("Degree", lambda p: [e.degree for e in p.education if e.degree]),
    "Institution": ("College Name", lambda p: [e.institution for e in p.education if e.institution]),
    "Grad. year": ("Graduation Year", lambda p: [e.year for e in p.education if e.year]),
    "Job title": ("Designation", lambda p: [e.title for e in p.experience if e.title]),
    "Company": ("Companies worked at", lambda p: [e.organization for e in p.experience if e.organization]),
}
UNSEEN_FIELDS = {
    "Job title": ("job_titles", TURKS_FIELDS["Job title"][1]),
    "Degree": ("degrees", TURKS_FIELDS["Degree"][1]),
    "Institution": ("institutions", TURKS_FIELDS["Institution"][1]),
    "Grad. year": ("graduation_years", TURKS_FIELDS["Grad. year"][1]),
}


def tally(gold: list[str], ours: list[str], counts: list[int]) -> None:
    """counts = [our values that match gold, our values, gold values matched, gold values]."""
    counts[0] += sum(any(_contains_either(x, y) for y in gold) for x in ours)
    counts[1] += len(ours)
    counts[2] += sum(any(_contains_either(y, x) for x in ours) for y in gold)
    counts[3] += len(gold)


def prf(counts: list[int]) -> tuple[float, float, float]:
    precision = counts[0] / counts[1] if counts[1] else 0.0
    recall = counts[2] / counts[3] if counts[3] else 0.0
    return precision, recall, (2 * precision * recall / (precision + recall) if precision + recall else 0.0)


def score(parse, resumes, fields) -> dict:
    """resumes: (text, {field key: gold values}) pairs."""
    counts = {f: [0, 0, 0, 0] for f in fields}
    for text, gold in resumes:
        profile = parse(text)
        for field, (key, get) in fields.items():
            tally(list(dict.fromkeys(gold.get(key, []))), get(profile), counts[field])
    result = {f: dict(zip(("precision", "recall", "f1"), prf(c))) for f, c in counts.items()}
    result["macro_f1"] = sum(r["f1"] for r in result.values()) / len(fields)
    return result


def load_sets(datasets_dir: Path):
    raw = datasets_dir / "archive (1)" / "Entity Recognition in Resumes.json"
    with open(raw, encoding="utf-8") as handle:
        turks = [json.loads(line) for line in handle if line.strip()][110:]
    unseen_dir = datasets_dir / "eval-unseen"
    texts = {r["id"]: r["text"] for r in map(json.loads, open(unseen_dir / "sample.jsonl", encoding="utf-8"))}
    labels = [json.loads(line) for line in open(unseen_dir / "labels.jsonl", encoding="utf-8")]
    return ([(r["content"], ground_truth_by_label(r)) for r in turks],
            [(texts[lab["id"]], lab) for lab in labels])


def parser_for(model: str, revision: str | None = None):
    from transformers import pipeline

    from app.services.local_ner_parser import parse_resume_local

    ner = pipeline("token-classification", model=model, revision=revision, aggregation_strategy="first")
    return lambda text: parse_resume_local(text, ner_pipeline=ner)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("models", nargs="*", type=Path, help="trained model folders")
    parser.add_argument("--datasets-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, help="write all scores as JSON here")
    args = parser.parse_args()

    turks, unseen = load_sets(args.datasets_dir)
    candidates = {"baseline (app model)": (ner_config.base_model, ner_config.base_model_revision)}
    candidates.update({str(m): (str(m), None) for m in args.models})
    results = {}
    for name, (model, revision) in candidates.items():
        parse = parser_for(model, revision)
        results[name] = {"dataturks_test": score(parse, turks, TURKS_FIELDS),
                         "unseen_livecareer": score(parse, unseen, UNSEEN_FIELDS)}
    for set_name, fields in (("dataturks_test", TURKS_FIELDS), ("unseen_livecareer", UNSEEN_FIELDS)):
        print(f"\n{set_name}: field F1")
        print(f"{'model':40s}" + "".join(f"{f:>13s}" for f in fields) + f"{'MACRO':>9s}")
        for name, r in results.items():
            row = r[set_name]
            print(f"{name[-40:]:40s}" + "".join(f"{row[f]['f1']:>12.0%} " for f in fields) + f"{row['macro_f1']:>8.0%}")
    if args.out:
        args.out.write_text(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
