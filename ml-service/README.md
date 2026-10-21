# ML service

FastAPI service implementing the resume analysis pipeline: parsing,
skill normalization, embedding-based role matching, ATS scoring, gap
analysis, and explanation generation. Design notes and setup instructions
also live in the separate `docs/` project (see the repo root README).

The backend (`../backend/`) calls this service's `POST /analyze-file?tier=free|premium`
once per resume upload -- a multipart file (PDF or DOCX) in, the full
`AnalyzeResponse` (profile, detected domain, ATS score, role matches, gaps,
explanation, lock state) out. `POST /parse-file` is the same file-upload
pattern for parsing alone; `/parse`, `/detect-domain`, `/match`, `/match-jd`,
`/ats-score`, and `/analyze` (routers/analyze.py) take raw text directly, for
callers that already have it. `/match-jd` (services/jd_match.py) scores an
already-extracted skill set against one pasted job description --
deterministic, no LLM: JD skills are dictionary hits against both taxonomies,
`score = 0.6 * coverage + 0.4 * embedding similarity`, with matched/missing
lists and the closest catalogue role. The backend exposes it to Premium
accounts as `POST /resumes/{id}/jd-match`.

## Domains, engines and tiers

`app/data/domains.json` lists every job domain the service knows, each with an
`engine` (`local` or `llm`) and a `tier` (`free` or `premium`).
`services/domain_classifier.py` assigns one to every resume deterministically
(dictionary hits + MiniLM similarity to the domain descriptions -- never an
LLM), and `services/pipeline.py` then routes:

| Domain engine | Caller tier | `llm_allowed` | What happens |
|---|---|---|---|
| `local` (Engineering & Technology) | free | ignored | local NER + dictionary parse, deterministic match, template explanation |
| `local` | premium | ignored | same, plus a Gemini coaching narrative |
| `llm` (every other domain) | premium | always | Gemini extraction, deterministic match against that domain's catalogue, Gemini narrative |
| `llm` | free | true (allowance left) | Gemini extraction, deterministic match, **template** explanation; `ai_extraction_used=true` unless it was a cache hit |
| `llm` | free | false | ATS + domain + local profile card; `recommendations_locked=true`, `lock_reason=ai_engine_required`, no LLM call |
| `llm` | any | — | with `LLM_PROVIDER=none` (Community Edition): locked, `lock_reason=community_edition`, no client is ever built |

The backend passes `llm_allowed` while a free account's monthly allowance
lasts and charges a credit only when the response says `ai_extraction_used`.
`LLM_DAILY_BUDGET_USD` is an operator brake on the free tier: past it, free
requests that need the AI engine lock with `ai_budget_exhausted` until the
next UTC day (Premium is unaffected).

Role catalogues: `app/data/role_skills.json` (engineering, curated) and
`app/data/role_skills_general.json` (the 22 other domains, 12 roles each, built
by `scripts/build_general_catalogue.py` from the LinkedIn postings dataset in
`../datasets/` -- re-run it and review the diff to change the catalogue; the
build is byte-reproducible). Non-IT engineers (mechanical, civil, electrical,
chemical, ...) have their own `core_engineering` domain: the builder's
`PRE_EXCLUSION_RULES` keep those titles before the software/IT exclusion, and
the classifier's engineering fast path only counts *software* taxonomy skills,
so a SolidWorks/ETAP/HYSYS resume never lands on the local pipeline.

Resume parsing runs fully offline by default (a local NER model, no
credentials or network call needed) -- see `PARSER_BACKEND` in `.env.example`.
The model is our fine-tune of `yashpwr/resume-ner-bert` (run 1's teacher,
`training/RESULTS.md`), loaded from `models/ner/teacher-run1` and pinned by the
SHA-256 of its weights. Fetch it, and the smaller distilled student, with
`scripts/fetch_ner_models.sh`.
Only the Premium paths (the LLM coaching narrative in `explainer.py`, and
LLM extraction when `PARSER_BACKEND=llm`) call an LLM -- Gemini on Vertex AI,
authenticated with **Google Application Default Credentials**. There is no
API key anywhere in this service: run `gcloud auth application-default login`
once on a dev machine (or attach a service account on GCP) and set
`GOOGLE_CLOUD_PROJECT`.

Quick start:

```bash
python -m venv .venv && source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu  # CPU-only, much smaller than the CUDA default
pip install -r requirements.txt
cp .env.example .env   # set GOOGLE_CLOUD_PROJECT (only needed for Premium/LLM paths -- parsing is offline by default)
gcloud auth application-default login   # once; ADC is the only Google credential this service uses
pytest tests/          # no credentials/network needed, LLM calls and the NER model are mocked
uvicorn app.main:app --reload
```

## LLM cost: what is assumed, and how to check it

Only the Premium paths call an LLM, and every call goes through
`services/llm_client.py`, which applies the same cost controls whatever the
provider:

| Control | Where | Default |
|---|---|---|
| Thinking off (`thinking_budget=0`) -- thinking tokens are billed as output, 8x the input rate | `GeminiLLMClient._generate` | `GEMINI_THINKING_BUDGET=0` |
| Whitespace-compacted, length-capped resume text in the extraction prompt | `parser.compact_resume_text` | `LLM_MAX_INPUT_CHARS=16000` |
| JSON mode + `temperature=0` for extraction (no fences/prose to pay for; same JSON for the same resume) | `_generate` | always |
| Bounded output: prompt asks for compact fields / <=180 words, plus hard `max_output_tokens` | `parser.py`, `explainer.py` | `3072` / `600` tokens |
| Gaps block dropped from the narrative prompt (it duplicated each match's `missing` list) | `explainer._build_user_prompt` | always |
| In-process completion cache keyed by (provider, model, options, prompts) | `_ProviderClient.complete` | `LLM_CACHE_SIZE=256` |
| Usage ledger: token counts from each response, priced with `LLM_*_USD_PER_1M` | `UsageLedger` | `0.30` / `2.50` per 1M |

**Cost per analysis -- assumed, then measured** (thinking off, the two-page
samples in `scripts/samples/`, list prices, 2026-09-14):

| Call | Prompt tokens | Output tokens | `gemini-2.5-flash` ($0.30 / $2.50 per 1M) | `gemini-2.5-flash-lite` ($0.10 / $0.40 per 1M) |
|---|---|---|---|---|
| `extract` (Premium, non-engineering only) | 826-891 | 453-511 | $0.0014-0.0015 | $0.00027-0.00028 |
| `narrate` (every Premium analysis) | 279-282 | 118-151 | $0.00045 | $0.00008 |
| **Premium, non-engineering** | | | **~$0.0019** | **~$0.00035** |
| **Premium, engineering** (narrative only) | | | ~$0.00045 | ~$0.00008 |
| **Free AI analysis, non-engineering** (extraction only, `--tier free`) | | | ~$0.0015 | **~$0.00028** |
| Free tier, engineering, or any locked result | 0 | 0 | 0 | 0 |

The pre-measurement assumption was ~$0.0024 on `gemini-2.5-flash`; the first
run came in at 0.91x of it, and dropping the never-rendered
`experience[].description` field from the extraction prompt took another
18-23% off the answer. Both models returned the same contact details,
experience and education and 22 skills for the nursing sample, so
`gemini-2.5-flash-lite` is the default. Not adopted after measuring:
asking for minified JSON (JSON mode ignores the formatting instruction, and
the one wording that worked dropped 4 skills). With thinking left on (the
SDK default) the same two calls add 1,000-4,000 reasoning tokens billed as
output, i.e. 2-4x the cost. A repeat of an unchanged resume is served from
the cache at $0.

**Checking the assumption against reality:** every `AnalyzeResponse` made
with an LLM call carries `llm_usage` (per-call prompt/output/thinking tokens
and the priced estimate), and `GET /llm-usage` gives the process totals
(`POST /llm-usage/reset` zeroes them). `scripts/llm_cost_check.py` runs the
Premium pipeline over the bundled sample resumes (or files you pass) and
prints assumed vs. actual side by side:

```bash
python scripts/llm_cost_check.py --dry-run          # estimates only, no API call
python scripts/llm_cost_check.py                     # real calls, needs ADC + GOOGLE_CLOUD_PROJECT
python scripts/llm_cost_check.py path/to/resume.pdf  # your own files
```

The estimates are list-price arithmetic, not billing -- confirm against the
Cloud Billing report, and update `LLM_INPUT_USD_PER_1M`/`LLM_OUTPUT_USD_PER_1M`
when the model changes.

## Logging

Every log line carries the request id the backend sends as `X-Request-Id`
(a new one when it is missing), so one upload can be followed through the
backend's and this service's logs: `grep <id>` in both. Each request writes an
access line (method, path, status, duration) and each analysis one outcome
line (tier, domain, engine, ATS score, number of matches, lock reason,
explanation source, LLM calls, duration). Resume text, names, contact details
and file names are never logged.

`LOG_LEVEL` (default `INFO`; `DEBUG` adds per-step timings) and `LOG_FILE`
(e.g. `logs/ml-service.log`, rotated at 10 MB) are set in `.env`. Run uvicorn
with `--no-access-log` to drop its own access lines, which lack the id.

## API docs

FastAPI generates these automatically, no setup needed: Swagger UI at
`http://localhost:8000/docs`, ReDoc at `http://localhost:8000/redoc`, raw OpenAPI document at
`http://localhost:8000/openapi.json`.
