"""Build the all-domain role catalogue and general skill taxonomy from the
LinkedIn postings dataset (datasets/archive (4)/linkedin_job_postings.csv +
job_skills.csv, ~1.3M postings with a comma-separated skills string each).

Offline and deterministic: the same inputs and the same rules below always
produce byte-identical output, so the committed JSONs can be regenerated and
diffed. The script is a build tool, never a runtime dependency -- the ML
service only reads the JSON files it writes:

  app/data/role_skills_general.json   [{role, domain, description, skills}]
  app/data/skill_taxonomy_general.json {Canonical Skill: [variants]}

Domain assignment is by title keyword rules, applied in order; the first
domain whose pattern matches the normalised title wins. PRE_EXCLUSION_RULES
run first so non-IT engineers (mechanical, civil, ...) and quality/safety
titles are kept; then titles that look like software/IT roles are skipped --
that domain is served by the curated role_skills.json and the local pipeline
(see domains.json); then DOMAIN_RULES.

Skills per role are ranked by share-within-title weighted by specificity
(inverse document frequency over all assigned postings), so a role's list
leads with what distinguishes it rather than with "Communication" and
"Teamwork" -- those still appear when they genuinely dominate a title.

Usage (from ml-service/):
    python scripts/build_general_catalogue.py            # full build
    python scripts/build_general_catalogue.py --limit 200000   # quick look
The output is meant to be reviewed by a person before it is committed.
"""

import argparse
import csv
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import DATA_DIR  # noqa: E402

DATASET_DIR = Path(__file__).resolve().parent.parent.parent / "datasets" / "archive (4)"
POSTINGS_CSV = DATASET_DIR / "linkedin_job_postings.csv"
SKILLS_CSV = DATASET_DIR / "job_skills.csv"

ROLES_OUT = DATA_DIR / "role_skills_general.json"
TAXONOMY_OUT = DATA_DIR / "skill_taxonomy_general.json"
DOMAINS_PATH = DATA_DIR / "domains.json"

# Tunables -- change these, re-run, review the diff.
ROLES_PER_DOMAIN = 12
MIN_POSTINGS_PER_ROLE = 40
SKILLS_PER_ROLE = 10
MIN_SKILLS_PER_ROLE = 6
MIN_SKILL_SHARE = 0.08  # a skill must appear in >= 8% of a title's postings

# Titles matching this are engineering/technology and are excluded here.
ENGINEERING_PATTERN = re.compile(
    r"\b(software|developer|programmer|engineer|engineering|devops|sre|"
    r"data scientist|data analyst|data engineer|machine learning|\bml\b|"
    r"\bai\b|cloud|cybersecurity|security analyst|it support|it specialist|"
    r"systems administrator|sysadmin|network administrator|database|"
    r"\bqa\b|quality assurance|test automation|ux|ui designer|product manager|"
    r"scrum master|solutions architect|technical writer|it project|"
    r"technical (project|program|programme) manager|it business analyst|"
    r"information technology|help desk|technical support|it technician)\b"
)

# Titles that say "engineer" but are not IT: checked BEFORE the engineering
# exclusion so mechanical/civil/electrical/... engineers get their own
# catalogue instead of being dropped (and, at runtime, being pulled onto the
# software pipeline). Bare "engineer", "systems/hardware/test/sales engineer"
# stay IT.
PRE_EXCLUSION_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("core_engineering", re.compile(
        r"\b(mechanical|civil|structural|electrical|electronics?|chemical|process|"
        r"industrial|manufacturing|automotive|aerospace|mechatronics|instrumentation|"
        r"hvac|piping|materials?|metallurg\w*|mining|petroleum|reliability|maintenance|"
        r"plant|r&d|design|project|controls?|power|geotechnical|environmental|"
        r"transportation|water resources|highway|bridge|building|facilities|"
        r"packaging|welding|tooling|stamping|mold|nuclear|marine|naval|robotics|"
        r"commissioning|field service|drilling|pipeline|utilities|substation|"
        r"protection|thermal|fire protection|acoustic\w*|lighting|energy) engineer\b")),
    ("quality_safety", re.compile(
        r"\b(quality (engineer|manager|inspector|technician|supervisor|analyst|specialist|"
        r"coordinator|director|auditor|lead|control|assurance (manager|inspector|technician|"
        r"supervisor|specialist|coordinator))|qa/qc|qc (inspector|technician|analyst)|"
        r"\behs\b|\bhse\b|health and safety|health & safety|(?<!public )safety (officer|"
        r"manager|coordinator|specialist|director|supervisor|technician|professional)|"
        r"iso auditor|six sigma|continuous improvement|inspector)\b")),
]

# (domain id, compiled pattern). Order matters: first match wins.
DOMAIN_RULES: list[tuple[str, re.Pattern[str]]] = [
    # Clinical titles first, so "rn case manager" / "clinical research nurse"
    # stay healthcare before the social-services and science rules see them.
    ("healthcare", re.compile(
        r"\b(nurse|nursing|\brn\b|\blpn\b|\blvn\b|\bcna\b|physician|doctor|"
        r"surgeon|surgical|dentist|hygienist|pharmac\w*|paramedic|\bemt\b|midwife|"
        r"psychiatr\w*)\b")),
    ("veterinary_agriculture", re.compile(
        r"\b(veterinar\w*|\bvet\b|animal|kennel|groomer|pet (care|groomer|stylist)|farm|"
        r"agricultur\w*|agronom\w*|horticultur\w*|greenhouse|forestry|forester|"
        r"ecolog\w*|conservation|wildlife|environmental (scientist|specialist|technician|"
        r"consultant|analyst|coordinator|planner)|crop|livestock|dairy|ranch|equine|"
        r"arborist|soil)\b")),
    ("social_services", re.compile(
        r"\b(social worker|social services?|case manager|caseworker|case worker|"
        r"community (outreach|health worker|organizer|engagement|support)|"
        r"outreach (coordinator|worker|specialist)|nonprofit|non-profit|policy analyst|"
        r"public health|counselor|counsellor|mental health|behavioral health|"
        r"youth (worker|counselor|specialist|advocate|care)|(patient|family|victim|"
        r"client|community|resident|housing|child|domestic violence|peer) advocate|humanitarian|"
        r"residential (counselor|aide|advisor)|direct support professional|\bdsp\b|"
        r"family (advocate|support|services)|substance abuse|peer support|crisis|"
        r"housing (specialist|coordinator|counselor)|benefits eligibility|"
        r"eligibility (specialist|worker))\b")),
    ("science_research", re.compile(
        r"\b(scientist|research (associate|assistant|fellow|technician|scientist|analyst|"
        r"coordinator|specialist|manager|chemist)|laboratory|lab (technician|analyst|"
        r"manager|assistant|associate|specialist|supervisor)|chemist|biologist|"
        r"microbiologist|postdoc\w*|formulation|bioinformatic\w*|clinical (research|"
        r"trial|data)|regulatory affairs|pharmacovigilance|drug safety|medical writer|"
        r"biostatistic\w*|geologist|physicist|toxicolog\w*|histolog\w*|\bcra\b|"
        r"r&d|research and development)\b")),
    ("healthcare", re.compile(
        r"\b(medical|clinical|clinician|therapist|therapy|dental|caregiver|patient|"
        r"health|radiolog\w*|phlebotom\w*|hospice|respiratory|dietitian|nutritionist|"
        r"sonograph\w*|optometr\w*|chiropract\w*|anesthesi\w*|physical therap\w*|"
        r"occupational therap\w*|speech language|behavior technician|\baba\b|"
        r"home care|technologist|psychologist)\b")),
    ("legal", re.compile(
        r"\b(attorney|lawyer|paralegal|legal|counsel|compliance|litigation|"
        r"contracts? (manager|administrator|specialist)|notary|law clerk)\b")),
    ("banking_insurance", re.compile(
        r"\b(underwrit\w*|actuar\w*|claims|insurance|loan|mortgage|credit (analyst|"
        r"officer|manager|specialist)|relationship (manager|banker)|banker|banking|"
        r"\bbank\b|wealth|investment|teller|branch manager|financial (advisor|planner|"
        r"consultant|representative|services representative)|risk (analyst|manager|"
        r"specialist)|trust officer|collections specialist|personal banker)\b")),
    ("finance_accounting", re.compile(
        r"\b(accountant|accounting|finance|financial|bookkeep\w*|auditor|"
        r"audit|\btax\b|payroll|controller|treasury|billing|"
        r"accounts payable|accounts receivable|\bcfo\b|fp&a|revenue cycle)\b")),
    ("human_resources", re.compile(
        r"\b(human resources?|\bhr\b|recruiter|recruiting|recruitment|"
        r"talent acquisition|people operations|people partner|benefits|"
        r"hrbp|compensation|onboarding specialist|learning and development|"
        r"employee relations)\b")),
    ("education", re.compile(
        r"\b(teacher|teaching|tutor|professor|instructor|faculty|lecturer|"
        r"school|education|educator|curriculum|academic|childcare|"
        r"preschool|paraprofessional|librarian|adjunct|instructional|"
        r"corporate trainer|training specialist|early childhood|special education|"
        r"substitute)\b")),
    ("design_creative", re.compile(
        r"\b(graphic designer|graphic design|art director|creative director|"
        r"illustrator|photographer|videographer|video editor|animator|"
        r"motion graphics|interior designer|fashion designer|copy editor|"
        r"editor|writer|journalist|reporter|video producer|content producer|creative|visual designer|"
        r"industrial designer|3d artist|sound designer)\b")),
    ("marketing", re.compile(
        r"\b(marketing|brand|content|copywriter|\bseo\b|\bsem\b|social media|"
        r"communications|public relations|\bpr\b|digital marketing|growth|"
        r"campaign|advertising|media planner|media buyer|"
        r"demand generation|event coordinator|events? manager)\b")),
    ("real_estate_property", re.compile(
        r"\b(real estate|realtor|property (manager|management|administrator|"
        r"accountant|coordinator|specialist)|assistant property|regional property|"
        r"leasing (consultant|agent|manager|specialist|professional|associate)|"
        r"estate agent|appraiser|facilities (manager|coordinator|director|supervisor)|"
        r"facility manager|escrow|title (officer|examiner|processor)|new home sales|"
        r"apartment|resident services|community manager)\b")),
    ("retail_ecommerce", re.compile(
        r"\b(store manager|assistant store manager|store (director|lead|supervisor|"
        r"team lead|team leader)|merchandis\w*|category manager|e-?commerce|"
        r"retail (manager|supervisor|operations|store|director|team lead|associate|"
        r"sales)|visual merchandiser|department manager|key holder|stocker|"
        r"stock associate|retail buyer|"
        r"assistant buyer|merchandise buyer|store associate|retail)\b")),
    ("sales", re.compile(
        r"\b(sales|account executive|account manager|business development|"
        r"territory|cashier|brand ambassador|customer success|sales associate)\b")),
    ("manufacturing_production", re.compile(
        r"\b(production (supervisor|manager|operator|worker|associate|technician|"
        r"lead|planner|scheduler|coordinator|team member|assistant)|plant (manager|"
        r"supervisor|operator|operations)|machine operator|\bcnc\b|machinist|"
        r"assembler|assembly|fabricator|press operator|line (lead|leader|operator)|"
        r"manufacturing (technician|associate|supervisor|manager|operator|team member)|"
        r"packaging (operator|associate|technician)|extrusion|injection mold\w*|"
        r"tool and die|toolmaker|manufacturing)\b")),
    ("operations_supply_chain", re.compile(
        r"\b(supply chain|logistics|warehouse|procurement|purchasing|buyer|"
        r"inventory|operations manager|operations coordinator|operations "
        r"specialist|forklift|shipping|receiving|dispatcher|fleet|truck "
        r"driver|\bcdl\b|delivery driver|driver|material handler|"
        r"distribution|freight|courier|order picker|packer|loader)\b")),
    ("construction_trades", re.compile(
        r"\b(construction|electrician|plumber|\bhvac\b|carpenter|welder|"
        r"maintenance technician|maintenance|mechanic|laborer|"
        r"painter|roofer|installer|superintendent|estimator|foreman|"
        r"facilities|technician|apprentice|journeyman|millwright|pipefitter|"
        r"mason|glazier|landscap\w*|groundskeeper|custodian|janitor)\b")),
    ("customer_service_hospitality", re.compile(
        r"\b(customer service|customer support|customer care|call center|"
        r"contact center|front desk|concierge|hotel|hospitality|restaurant|"
        r"server|bartender|barista|\bcook\b|chef|kitchen|housekeep\w*|"
        r"guest services?|host|hostess|food service|dishwasher|line cook|"
        r"crew member|team member|cashier|steward|banquet|catering|"
        r"shift (lead|leader|supervisor|manager)|"
        r"room attendant|valet|flight attendant|travel agent|travel consultant)\b")),
    # Generic PM/consulting titles last but one, so "construction project
    # manager", "sales consultant", "leasing consultant" have already gone to
    # their own domains.
    ("consulting_project_management", re.compile(
        r"\b(project manager|program manager|programme manager|project management|"
        r"\bpmo\b|management consultant|business analyst|business consultant|"
        r"consultant|strategy (consultant|analyst|manager|associate)|change manager|"
        r"transformation|project lead|portfolio manager|scrum)\b")),
    ("administration", re.compile(
        r"\b(administrative|executive assistant|office manager|office "
        r"assistant|receptionist|data entry|clerk|secretary|scheduler|"
        r"office coordinator|admin assistant|personal assistant|virtual assistant|"
        r"front office|program coordinator|project coordinator)\b")),
]

# Stripped from titles before clustering so "Senior Staff Accountant II"
# and "Staff Accountant" become the same role.
SENIORITY_PATTERN = re.compile(
    r"\b(senior|sr\.?|junior|jr\.?|lead|principal|staff|entry level|"
    r"entry-level|experienced|associate level|level [ivx\d]+|"
    r"remote|hybrid|onsite|on-site|part[- ]time|full[- ]time|temporary|"
    r"seasonal|contract|per diem|prn|urgent|immediate|hiring|now hiring|"
    r"travel|\bft\b|\bpt\b|"
    r"sign[- ]on bonus|weekends?|nights?|days?|evenings?|overnight|"
    r"[ivx]{1,4}|\d+)\b"
)
GENERIC_SKILL_PATTERN = re.compile(r"^[a-z0-9 &/+\-\.'()]+$")
# Benefits, credentials-as-requirements and posting boilerplate that the
# dataset lists in the same field as skills.
NON_SKILL_PATTERN = re.compile(
    r"401k|401\(k\)|retirement|insurance|coverage|diploma|degree|paid time|"
    r"\bpto\b|competitive|salary|bonus|benefit|background check|drug (test|screen)|"
    r"equal opportunity|\beeo\b|per hour|\$|weekly pay|tuition|discount|vacation|"
    r"holiday|flexible schedule|environment|years of|must be|ability to|"
    r"willing|authorized to work|h&r block|stock purchase|medical coverage|"
    r"life insurance|dental|vision plan|employee assistance|wellness program|"
    r"opportunity for advancement|identity theft|disability|hours per week|"
    r"vaccination|stipend|driver'?s license|drivers license|^travel$|remote work|"
    r"work ethic|cover letter|curriculum vitae|flexible work|^loyalty$|^endurance$|"
    r"fun and enthusiastic|paid volunteering|school loan|mileage|reimbursement|"
    r"weekend availability|financial motivation|transferable skills|^service$|"
    r"^scholarship$|^clinical$|^engineering$|^diversity$|parental leave|"
    r"continuing education|allowance|flexible scheduling|wellness|gender affirmation|"
    r"prosal|clinical studies program|^client$|autonomous medicine|pre-?employment|"
    r"independent contractor|training resources|^leads$|referral incentive|"
    r"professional certification|^sales promotions$|^service awards$|"
    r"^moving supplies$|^power panels$|music and pop culture|health savings account|"
    r"mental health support|equity inclusion|diversity resources|coaching support|"
    r"^veterinarian$|mars five|debt relief|volunteer opportunities|work ?life balance|"
    r"^culture$|^collaborative environment$"
)
# Normalised titles that survived the rules but are not roles anyone would
# target (recruiting-programme names, one employer's internal titles).
EXCLUDED_TITLES = {
    "store manager candidate",
    "volunteer affiliated photographer",
    "specialty order writer",
    "first year tax professional",
    "school recruitment & talent management",
    "amazon advertising strategist",
    "graduate recruitment consultant",
    "restaurant team leader",
    "retail",
    "sales",
    "audit",
    "technician",
    "jde business analyst",
    "jd edwards business analyst",
    "public safety officer",
    "guest advocate",
    "beauty consultant",
    "design consultant",
    "warehouse",
}
# Small, reviewable merges of titles the normaliser cannot fold on its own.
TITLE_ALIASES = {
    "rn": "registered nurse",
    "rn registered nurse": "registered nurse",
    "registered nurse rn": "registered nurse",
    "nurse rn": "registered nurse",
    "host/hostess": "host",
    "hostess": "host",
    # One profession, four spellings (MLS/CLS); likewise the technologists.
    "clinical lab scientist": "medical laboratory scientist",
    "medical lab scientist": "medical laboratory scientist",
    "clinical laboratory scientist": "medical laboratory scientist",
    "clinical laboratory technologist": "medical laboratory technologist",
    "medical lab technologist": "medical laboratory technologist",
    "associate veterinarian": "veterinarian",
    "care veterinarian": "veterinarian",
    "hospital veterinarian": "veterinarian",
    "mortgage loan officer with in house agents and": "mortgage loan officer",
    "real estate agent for new home sales": "real estate agent",
    "mental health counselors": "mental health counselor",
    "small animal vet": "small animal veterinarian",
    "care relief veterinarian": "relief veterinarian",
    "dsw store associate": "store associate",
}


def normalise_title(title: str) -> str:
    """Lowercase, cut off everything after the first separator, strip
    seniority/schedule words and punctuation, collapse whitespace."""
    t = title.lower()
    t = re.split(r"\s[-–—|/]\s|\(|\[|,|:", t, maxsplit=1)[0]
    t = SENIORITY_PATTERN.sub(" ", t)
    t = re.sub(r"[^a-z&/+ ]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return TITLE_ALIASES.get(t, t)


def assign_domain(normalised_title: str) -> str | None:
    for domain_id, pattern in PRE_EXCLUSION_RULES:
        if pattern.search(normalised_title):
            return domain_id
    if ENGINEERING_PATTERN.search(normalised_title):
        return None
    for domain_id, pattern in DOMAIN_RULES:
        if pattern.search(normalised_title):
            return domain_id
    return None


def clean_skill(raw: str) -> str | None:
    s = re.sub(r"\s+", " ", raw).strip().strip(".;:")
    s = re.sub(r"\s+experience$", "", s, flags=re.I)
    if not s or len(s) > 40 or len(s) < 2:
        return None
    if not GENERIC_SKILL_PATTERN.match(s.lower()):
        return None
    if NON_SKILL_PATTERN.search(s.lower()):
        return None
    return s


def display_name(title: str) -> str:
    small = {"and", "of", "the", "&", "for", "in", "to", "a", "an", "or"}
    words = []
    for i, w in enumerate(title.split()):
        if w in small and i:
            words.append(w)
        elif w.upper() in {"RN", "LPN", "LVN", "CNA", "HVAC", "CDL", "HR", "CFO", "EMT", "SEO", "PR"}:
            words.append(w.upper())
        else:
            words.append("/".join(part.capitalize() for part in w.split("/")))
    return " ".join(words)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None, help="only read the first N postings (for a quick look)")
    args = parser.parse_args()

    domains = {d["id"]: d for d in json.loads(DOMAINS_PATH.read_text(encoding="utf-8"))}
    general_domains = [d["id"] for d in domains.values() if d["engine"] != "local"]

    # Pass 1: postings -> (domain, normalised title) per job_link.
    link_to_role: dict[str, tuple[str, str]] = {}
    title_display: dict[str, Counter[str]] = defaultdict(Counter)
    with POSTINGS_CSV.open(encoding="utf-8", newline="") as f:
        for i, row in enumerate(csv.DictReader(f)):
            if args.limit and i >= args.limit:
                break
            norm = normalise_title(row["job_title"] or "")
            if not norm or len(norm) < 3:
                continue
            if norm in EXCLUDED_TITLES:
                continue
            domain_id = assign_domain(norm)
            if domain_id is None:
                continue
            link_to_role[row["job_link"]] = (domain_id, norm)
            title_display[norm][display_name(norm)] += 1
    print(f"assigned {len(link_to_role):,} postings to {len(general_domains)} domains", file=sys.stderr)

    # Pass 2: skills -> counts per (domain, title) and global document frequency.
    role_postings: Counter[tuple[str, str]] = Counter()
    role_skill_counts: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    skill_df: Counter[str] = Counter()
    skill_display: dict[str, Counter[str]] = defaultdict(Counter)
    total_docs = 0
    with SKILLS_CSV.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            role = link_to_role.get(row["job_link"])
            if role is None:
                continue
            seen: set[str] = set()
            for raw in (row["job_skills"] or "").split(","):
                skill = clean_skill(raw)
                if skill is None:
                    continue
                key = skill.lower()
                if key in seen:
                    continue
                seen.add(key)
                skill_display[key][skill] += 1
            if not seen:
                continue
            total_docs += 1
            role_postings[role] += 1
            for key in seen:
                role_skill_counts[role][key] += 1
                skill_df[key] += 1
    print(f"{total_docs:,} postings had skills", file=sys.stderr)

    # Rank roles per domain and skills per role.
    roles_out: list[dict] = []
    taxonomy: dict[str, list[str]] = {}
    for domain_id in general_domains:
        candidates = sorted(
            ((n, role) for role, n in role_postings.items() if role[0] == domain_id and n >= MIN_POSTINGS_PER_ROLE),
            key=lambda x: (-x[0], x[1][1]),
        )[:ROLES_PER_DOMAIN]
        for n_posts, role in candidates:
            counts = role_skill_counts[role]
            scored = []
            for key, c in counts.items():
                share = c / n_posts
                if share < MIN_SKILL_SHARE:
                    continue
                idf = math.log(total_docs / skill_df[key])
                scored.append((-(share * idf), key))
            scored.sort()
            picked = [k for _, k in scored[:SKILLS_PER_ROLE]]
            if len(picked) < MIN_SKILLS_PER_ROLE:
                for key, _ in counts.most_common():
                    if key not in picked:
                        picked.append(key)
                    if len(picked) >= MIN_SKILLS_PER_ROLE:
                        break
            skills = [skill_display[k].most_common(1)[0][0] for k in picked]
            role_name = title_display[role[1]].most_common(1)[0][0]
            roles_out.append({
                "role": role_name,
                "domain": domain_id,
                "description": f"{role_name} roles in {domains[domain_id]['name']}",
                "skills": skills,
                "source_postings": n_posts,
            })
            for skill in skills:
                taxonomy.setdefault(skill, [skill.lower()])

    roles_out.sort(key=lambda r: (general_domains.index(r["domain"]), -r["source_postings"], r["role"]))
    ROLES_OUT.write_text(json.dumps(roles_out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    TAXONOMY_OUT.write_text(
        json.dumps(dict(sorted(taxonomy.items())), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    per_domain = Counter(r["domain"] for r in roles_out)
    for domain_id in general_domains:
        print(f"{domain_id:30s} {per_domain[domain_id]:3d} roles", file=sys.stderr)
    print(f"wrote {len(roles_out)} roles -> {ROLES_OUT.name}, {len(taxonomy)} skills -> {TAXONOMY_OUT.name}", file=sys.stderr)


if __name__ == "__main__":
    main()
