"""Builds the NER training set from the cleaned records and the Gemini labels.

    cd ml-service
    # 1. the 110 DataTurks train/dev resumes whose skills Gemini re-labels:
    python -m training.data_prep.training_set skill-inputs PREPARED/records/dataturks.jsonl OUT.jsonl
    #    then: python -m training.data_prep.gemini_label OUT.jsonl --model gemini-3.5-flash-lite \
    #            --out LABELLED/dataturks-skills.v3.jsonl --max-usd 1
    # 2. the training set:
    python -m training.data_prep.training_set build --dataturks PREPARED/records/dataturks.jsonl \
        --pool LABELLED/gemini-3.5-flash-lite.v3.jsonl --turks-skills LABELLED/dataturks-skills.v3.jsonl \
        --out TRAINING_DIR

Skills follow one rule everywhere: one span per skill. DataTurks marks whole
skill paragraphs, so its train and dev resumes keep their human labels for
every other field and take their skills from Gemini. The pool's 2,461
Gemini-labelled LiveCareer resumes go to train, apart from a fixed 5 % that
joins dev for choosing when to stop. DataTurks test (resumes 111 to 220) is
copied untouched: it is where the model is scored against the baseline, so
it is never trained on.

Writes records/{train,dev,test}.jsonl, bio/{train,dev,test}.jsonl and
report.json, and nothing at all if any record fails validation.
"""

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

from training.data_prep.bio import to_bio
from training.data_prep.build import write_jsonl
from training.data_prep.schema import Entity, Record, validate_record

YEAR_RE = re.compile(r"\b(19|20)\d\d\b")
POOL_DEV_FRACTION = 0.05


def read_records(path: Path) -> list[Record]:
    with open(path, encoding="utf-8") as handle:
        return [Record.from_dict(json.loads(line)) for line in handle if line.strip()]


def in_pool_dev(record_id: str) -> bool:
    """A fixed 5 % of the pool, chosen by a hash of the id so every rebuild
    picks the same resumes."""
    return int(hashlib.sha1(record_id.encode()).hexdigest(), 16) % 1000 < POOL_DEV_FRACTION * 1000


def drop_non_year_graduation_years(record: Record, stats: Counter) -> Record:
    """A graduation year must contain a year: Gemini occasionally tagged
    "Present" or a bare month (4 of 4,140 in the pool run)."""
    kept = []
    for entity in record.entities:
        if entity.label == "Graduation Year" and not YEAR_RE.search(record.text[entity.start:entity.end]):
            stats["graduation_year_without_year_dropped"] += 1
            continue
        kept.append(entity)
    record.entities = kept
    return record


def merge_skills(human: Record, gemini: Record, stats: Counter) -> Record:
    """Human labels for every field but Skills; Gemini's one-per-skill spans
    for Skills, except where they would overlap a human label."""
    if human.text != gemini.text:
        raise ValueError(f"{human.id}: the Gemini record's text differs from the human record's")
    others = [e for e in human.entities if e.label != "Skills"]
    stats["human_skill_spans_replaced"] += len(human.entities) - len(others)
    skills = []
    for entity in gemini.entities:
        if entity.label != "Skills":
            continue
        if any(entity.start < o.end and entity.end > o.start for o in others):
            stats["gemini_skill_overlapping_human_label_dropped"] += 1
            continue
        skills.append(Entity(entity.start, entity.end, "Skills"))
    stats["gemini_skill_spans_added"] += len(skills)
    return Record(human.id, human.source, human.split, human.text,
                  sorted(others + skills, key=lambda e: e.start), {**human.meta, "skills_from": gemini.source})


def build(dataturks_path: Path, pool_path: Path, turks_skills_path: Path, out_dir: Path) -> dict:
    stats: Counter = Counter()
    turks = read_records(dataturks_path)
    gemini_turks = {r.id: r for r in read_records(turks_skills_path)}
    splits: dict[str, list[Record]] = {"train": [], "dev": [], "test": []}

    for record in turks:
        if record.split == "test":
            splits["test"].append(record)
            continue
        if record.id not in gemini_turks:
            raise ValueError(f"{record.id}: no Gemini skills for this DataTurks {record.split} resume; "
                             f"run the skill-inputs step and label them first")
        splits[record.split].append(merge_skills(record, gemini_turks[record.id], stats))

    for record in read_records(pool_path):
        record = drop_non_year_graduation_years(record, stats)
        record.split = "dev" if in_pool_dev(record.id) else "train"
        splits[record.split].append(record)

    ids = {split: {r.id for r in records} for split, records in splits.items()}
    problems = [p for records in splits.values() for r in records for p in validate_record(r)]
    if ids["test"] & (ids["train"] | ids["dev"]):
        problems.append(f"test resumes also in train/dev: {sorted(ids['test'] & (ids['train'] | ids['dev']))[:5]}")
    if sum(len(v) for v in ids.values()) != sum(len(v) for v in splits.values()):
        problems.append("duplicate resume ids")
    if problems:
        raise ValueError("\n".join(problems[:50]))

    bio = {split: [to_bio(r) for r in records] for split, records in splits.items()}
    for split in splits:
        write_jsonl(out_dir / "records" / f"{split}.jsonl", [r.to_dict() for r in splits[split]])
        write_jsonl(out_dir / "bio" / f"{split}.jsonl", bio[split])
    report = {
        "resumes": {split: dict(Counter(r.source.split(":")[0] for r in records)) for split, records in splits.items()},
        "cleaning": dict(stats),
        "entities_per_label": {split: dict(Counter(e.label for r in records for e in r.entities).most_common())
                               for split, records in splits.items()},
        "bio_words": {split: sum(len(row["tokens"]) for row in rows) for split, rows in bio.items()},
    }
    (out_dir / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def write_skill_inputs(dataturks_path: Path, out_path: Path) -> int:
    rows = [{"id": r.id, "text": r.text} for r in read_records(dataturks_path) if r.split in ("train", "dev")]
    write_jsonl(out_path, rows)
    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    inputs = commands.add_parser("skill-inputs", help="DataTurks train/dev resumes for Gemini skill labelling")
    inputs.add_argument("dataturks", type=Path)
    inputs.add_argument("out", type=Path)
    make = commands.add_parser("build", help="write the training set")
    make.add_argument("--dataturks", type=Path, required=True)
    make.add_argument("--pool", type=Path, required=True)
    make.add_argument("--turks-skills", type=Path, required=True)
    make.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    if args.command == "skill-inputs":
        print(f"{write_skill_inputs(args.dataturks, args.out)} resumes written to {args.out}")
        return 0
    try:
        report = build(args.dataturks, args.pool, args.turks_skills, args.out)
    except ValueError as error:
        print("Nothing written:\n" + str(error), file=sys.stderr)
        return 1
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
