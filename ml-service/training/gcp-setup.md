# GCP setup for data preparation and labelling

How the datasets move into Google Cloud and how the data work runs there. The
laptop only runs `gcloud` commands and the upload. Cleaning, preparation and
labelling run on a VM. Authentication is Application Default Credentials
throughout: your gcloud login on the laptop, the VM's service account on the
VM. No key file is created at any step. Training on a GPU comes later
([README.md](README.md) §2).

Before each stage, run its checks from [PREFLIGHT.md](PREFLIGHT.md), from
`ml-service/`: `training/gcp/preflight.sh setup|data|vm|label|after`.

Written against Google Cloud SDK 588. Commands run on the laptop unless a
step says "on the VM".

## 0. Values used below

| Name | Value |
|---|---|
| Project | `smart-resume-analyzer-a7x2` |
| Region / zone | `asia-south1` (Mumbai) / `asia-south1-a` |
| Bucket | `gs://smart-resume-analyzer-a7x2-data` |
| VM | `data-prep-vm` (e2-small, Ubuntu 24.04), service account `data-prep` |
| BigQuery dataset | `resume_data` (same region as the bucket) |

Keep everything in one region: BigQuery can only load from a bucket in its
own location, and traffic inside a region is free.

```bash
export PROJECT=smart-resume-analyzer-a7x2
export REGION=asia-south1
export ZONE=asia-south1-a
export BUCKET=gs://smart-resume-analyzer-a7x2-data
export SA=data-prep@$PROJECT.iam.gserviceaccount.com
gcloud config set project $PROJECT
```

The scripts in `training/gcp/` use the same values (`common.sh`).

## 1. One-time setup

```bash
gcloud services enable compute.googleapis.com billingbudgets.googleapis.com
```

Cloud Storage, Vertex AI and BigQuery are already enabled.

### Budget alert

An email when gross spend reaches 50 %, 90 % and 100 % of $25 in a month.
Credits are excluded, so the alert tracks real usage even while a free-trial
credit pays the bill. It only warns; it stops nothing.

```bash
ACCOUNT=$(gcloud billing projects describe $PROJECT --format="value(billingAccountName)")
gcloud billing budgets create --billing-account=${ACCOUNT#billingAccounts/} \
  --display-name="resume-analyzer data work" --budget-amount=25USD \
  --filter-projects=projects/$PROJECT --credit-types-treatment=exclude-all-credits \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
```

### Bucket

Private, with public access blocked, because the datasets contain real
resumes with names and email addresses. Soft delete is on by default: a
deleted or overwritten file can be restored for 7 days.

```bash
gcloud storage buckets create $BUCKET --location=$REGION \
  --uniform-bucket-level-access --public-access-prevention
```

| Prefix | Holds |
|---|---|
| `raw/` | The laptop's `datasets/` folder, file for file, without build outputs |
| `code/` | The committed `ml-service` code the VM runs, and its `VERSION` |
| `prepared/` | The VM's `training/data_prep` build, with `SHA256SUMS` |
| `labelled/` | Gemini labels, `run.log`, and `DONE` when the full run ends |
| `training/` | BIO files the training job reads (later) |

## 2. Upload the datasets from the laptop

One rsync copies the whole `datasets/` folder (about 6.6 GB, 2,900 files),
including the large LinkedIn posting sets, so nothing needs downloading on the
VM. Look at the dry run first.

```bash
cd ~/BiswasPub/Smart-Resume-Analyzer-and-Job-Recommendation-System
EXCLUDE='^(prepared|labelled)/.*|.*__pycache__/.*|.*\.~lock\..*'
gcloud storage rsync --recursive --dry-run --exclude="$EXCLUDE" datasets $BUCKET/raw | tail
gcloud storage rsync --recursive --exclude="$EXCLUDE" datasets $BUCKET/raw
gcloud storage cp datasets/labelled/gemini-3.5-flash-lite.v3.jsonl $BUCKET/labelled/
```

- The exclusions are build outputs (the VM rebuilds `prepared/`; labels have
  their own prefix), Python caches and LibreOffice lock files.
- The last line uploads the 10 resumes already labelled on the laptop, so the
  VM skips them rather than paying for them again.
- Each file is checked against its hash on upload, and running the rsync again
  copies only what changed.

Folder names follow the laptop's: `archive` holds the LiveCareer resumes,
`archive (1)` DataTurks, and `archive (3)` and `archive (4)` the two LinkedIn
posting sets ([docs/datasets.md](../../docs/datasets.md)).

## 3. A VM for the resume work

### Service account

The VM acts as this account, so code on it gets Google credentials
automatically (ADC). No key file is created.

```bash
gcloud iam service-accounts create data-prep --display-name="Data prep VM"
gcloud storage buckets add-iam-policy-binding $BUCKET \
  --member=serviceAccount:$SA --role=roles/storage.objectAdmin
gcloud projects add-iam-policy-binding $PROJECT \
  --member=serviceAccount:$SA --role=roles/aiplatform.user --condition=None
```

`roles/storage.objectAdmin` on the bucket lets it read and write this bucket
only; `roles/aiplatform.user` lets it call Gemini on Vertex AI.

### Create the VM

```bash
gcloud compute instances create data-prep-vm --zone=$ZONE \
  --machine-type=e2-small --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB --service-account=$SA --scopes=cloud-platform \
  --metadata=enable-oslogin=TRUE
```

- A standard VM rather than Spot. The labelling run takes about 3 hours
  unattended, and Google can stop a Spot VM at any time, which leaves the run
  halted until someone restarts it. For an e2-small the difference is a few
  cents.
- e2-small (2 shared vCPUs, 2 GB) is enough: the build needs under 60 MB, and
  labelling waits on the network. For heavier work, stop the VM, change its
  machine type with `gcloud compute instances set-machine-type`, and start it
  again.
- Ubuntu 24.04 ships Python 3.12, the laptop's version, so the text cleaning
  gives byte-identical output (pre-flight check 4.1 proves it).
- OS Login: `gcloud compute ssh` signs in with your Google account, and no
  SSH keys go into the project's metadata.

### Put the code on the VM

The VM runs committed code only: `push_code.sh` uploads `git archive` of
`ml-service` with a `VERSION` file (commit and code fingerprint), unpacks it on
the VM, and refuses to run while a `.py` or `.sh` file has uncommitted changes.
The first time, also create the Python environment.

```bash
cd ml-service
training/gcp/push_code.sh
gcloud compute ssh data-prep-vm --zone=$ZONE --command="bash ~/ml-service/training/gcp/vm.sh setup"
```

## 4. Prepare the resume data (on the VM)

```bash
gcloud compute ssh data-prep-vm --zone=$ZONE --command="bash ~/ml-service/training/gcp/vm.sh test && bash ~/ml-service/training/gcp/vm.sh build"
training/gcp/preflight.sh label
```

`vm.sh build` downloads only what the build reads, runs `training.data_prep.build`,
writes a SHA-256 for every output file and copies the result to `prepared/`.
The pre-flight then compares those hashes with the laptop's build. What the
build fixes and how to read its report: [data_prep/README.md](data_prep/README.md).

## 5. Gemini labelling with `gemini-3.5-flash-lite` (on the VM)

The unlabelled resumes are labelled by `gemini-3.5-flash-lite` with prompt v3,
the model chosen after measuring quality and cost on two check sets
([data_prep/LABELLING.md](data_prep/LABELLING.md)). The app's own Gemini
calls (Premium extraction and coaching) are unaffected and stay on
`gemini-2.5-flash-lite`.

The cost rule, with the labeller's own checks:

```bash
V="bash ~/ml-service/training/gcp/vm.sh"
gcloud compute ssh data-prep-vm --zone=$ZONE --command="$V dry-run"    # estimate, no API call
gcloud compute ssh data-prep-vm --zone=$ZONE --command="$V sample 5"   # compare actual with assumed
gcloud compute ssh data-prep-vm --zone=$ZONE \
  --command="nohup setsid $V full > ~/full.out 2>&1 < /dev/null &"     # about 3 hours, unattended
```

`vm.sh full` labels the rest with `--max-usd 12` (about $9 for the 2,461-resume
pool). While it runs:

- It copies the labels and `run.log` to `$BUCKET/labelled/` every 5 minutes.
- After a crash that made progress it restarts, at most 5 times. Finished
  resumes are skipped, so a restart re-pays for at most the one resume that
  was in flight.
- At the end it writes `labelled/DONE` and powers the VM off.

Progress from the laptop:

```bash
gcloud storage cat $BUCKET/labelled/run.log | tail -3
gcloud storage cat $BUCKET/labelled/DONE          # exists once the run has ended
```

## 6. Stop paying when done

The VM powers itself off after `vm.sh full`. A stopped VM costs only its 20 GB
disk, under $1 a month. Delete it when the data work is finished; the bucket
keeps every result.

```bash
training/gcp/preflight.sh after
gcloud compute instances delete data-prep-vm --zone=$ZONE   # when finished
```

## 7. Later: clean the job postings in BigQuery

For the next rebuild of the role catalogue. Loading reads from the bucket
inside Google's network, so it is fast even from the laptop.

```bash
bq mk --dataset --location=$REGION $PROJECT:resume_data
bq load --source_format=CSV --autodetect --allow_quoted_newlines --skip_leading_rows=1 \
  --max_bad_records=1000 resume_data.linkedin_postings_raw \
  "$BUCKET/raw/archive (4)/linkedin_job_postings.csv"
```

Then clean with SQL, for example deduplicating on the job link:

```sql
CREATE OR REPLACE TABLE resume_data.linkedin_postings AS
SELECT * EXCEPT(rn) FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY job_link ORDER BY last_processed_time DESC) AS rn
  FROM resume_data.linkedin_postings_raw
  WHERE job_title IS NOT NULL
) WHERE rn = 1;
```

Check the real column names with `bq show --schema resume_data.linkedin_postings_raw`
before writing queries. The first 1 TiB of queries each month is free; this
data is a few GB.

## 8. Later: GPU training

Training needs an NVIDIA T4 GPU. Free-trial accounts cannot attach GPUs, so
upgrade the billing account first (the remaining credit carries over), then
request GPU quota (`GPUS_ALL_REGIONS` and T4 in `asia-south1`) in the console
under IAM & Admin → Quotas. Approval can take a day. The VM setup is in
[README.md](README.md) §2.
