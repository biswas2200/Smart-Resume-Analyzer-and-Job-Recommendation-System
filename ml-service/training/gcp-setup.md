# GCP setup for data preparation and labelling

How to move the datasets into Google Cloud and run the heavy data work there,
using the `gcloud` and `bq` tools already set up on the dev laptop. Training on a
GPU comes later and is covered in [README.md](README.md) §2.

Written against Google Cloud SDK 588. Every command runs from the laptop
terminal unless the step says "on the VM".

## 0. Values used below

| Name | Value |
|---|---|
| Project | `smart-resume-analyzer-a7x2` |
| Region / zone | `asia-south1` (Mumbai) / `asia-south1-a` |
| Bucket | `gs://smart-resume-analyzer-a7x2-data` |
| BigQuery dataset | `resume_data` (same region as the bucket) |
| VM | `data-prep-vm`, service account `data-prep` |

Keep the bucket, the BigQuery dataset and the VM in the same region: BigQuery
can only load from a bucket in its own location, and traffic inside one region
is free.

```bash
export PROJECT=smart-resume-analyzer-a7x2
export REGION=asia-south1
export ZONE=asia-south1-a
export BUCKET=gs://smart-resume-analyzer-a7x2-data
gcloud config set project $PROJECT
```

## 1. One-time setup

### Budget alert

An email when spend reaches 50 %, 90 % and 100 % of $25, so nothing runs up the
credit unnoticed. The alert does not stop resources; it only warns.

```bash
gcloud billing projects describe $PROJECT --format="value(billingAccountName)"
# prints billingAccounts/XXXXXX-XXXXXX-XXXXXX; use the part after the slash:
gcloud billing budgets create --billing-account=XXXXXX-XXXXXX-XXXXXX \
  --display-name="resume-analyzer data work" --budget-amount=25USD \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
```

### Bucket

Private, with public access blocked, because the datasets contain real
resumes with names and email addresses.

```bash
gcloud storage buckets create $BUCKET --location=$REGION \
  --uniform-bucket-level-access --public-access-prevention
```

Layout used by every later step:

| Prefix | Holds |
|---|---|
| `raw/` | Datasets exactly as downloaded |
| `prepared/` | Output of `training/data_prep` (common JSONL format) |
| `labelled/` | Gemini labels for unlabelled resumes |
| `training/` | BIO files the training job reads |

## 2. Upload the small resume data from the laptop

The home connection measured about 0.5 Mbps upload, so only the resume data the
next step needs goes up from the laptop, compressed. The large job-postings
sets are downloaded on the VM instead (step 3).

```bash
cd ~/BiswasPub/Smart-Resume-Analyzer-and-Job-Recommendation-System/datasets
tar czf /tmp/resume-data.tgz "archive/Resume/Resume.csv" "archive (1)" eval-unseen
gcloud storage cp /tmp/resume-data.tgz $BUCKET/raw/resume-data.tgz
gcloud storage du --summarize $BUCKET/raw/
```

`gcloud storage cp` resumes an interrupted upload when run again. With a fast
connection (10 Mbps or more), the whole folder can go up directly instead:
`gcloud storage rsync --recursive datasets $BUCKET/raw`.

## 3. A CPU VM for the heavy work

No GPU is needed for cleaning or labelling, so this works on the free trial.

### Service account

The VM acts as this account, so code on it gets Google credentials
automatically (Application Default Credentials). No key file is created.

```bash
gcloud services enable compute.googleapis.com
gcloud iam service-accounts create data-prep --display-name="Data prep VM"
SA=data-prep@$PROJECT.iam.gserviceaccount.com
gcloud storage buckets add-iam-policy-binding $BUCKET \
  --member=serviceAccount:$SA --role=roles/storage.objectAdmin
gcloud projects add-iam-policy-binding $PROJECT \
  --member=serviceAccount:$SA --role=roles/aiplatform.user
```

`roles/storage.objectAdmin` lets it read and write this bucket only;
`roles/aiplatform.user` lets it call Gemini on Vertex AI.

### Create the VM

A Spot VM costs much less than a regular one. Google may stop it at any time;
`--instance-termination-action=STOP` keeps the disk, so you just start it again.

```bash
gcloud compute instances create data-prep-vm --zone=$ZONE \
  --machine-type=e2-standard-4 \
  --image-family=debian-12 --image-project=debian-cloud --boot-disk-size=50GB \
  --service-account=$SA --scopes=cloud-platform \
  --provisioning-model=SPOT --instance-termination-action=STOP
gcloud compute ssh data-prep-vm --zone=$ZONE
```

`e2-standard-4` has 4 vCPUs and 16 GB RAM, enough to stream the 5.8 GB CSV.

### On the VM: tools and the repository

```bash
sudo apt-get update && sudo apt-get install -y git python3-venv
git clone https://github.com/biswas2200/Smart-Resume-Analyzer-and-Job-Recommendation-System.git
cd Smart-Resume-Analyzer-and-Job-Recommendation-System
git switch frontend-vanilla-and-ner-v1      # until it is merged
python3 -m venv .venv && . .venv/bin/activate
pip install kaggle
```

If the repository is private, `git clone` asks for a GitHub login: use a
personal access token as the password, or copy the code up from the laptop with
`gcloud compute scp --recurse ml-service data-prep-vm:~/repo/ --zone=$ZONE`.

### On the VM: download the large datasets straight from Kaggle

Create an API token at kaggle.com (Settings → API → Create New Token) and copy
it up from the laptop: `gcloud compute scp ~/Downloads/kaggle.json
data-prep-vm:~/ --zone=$ZONE`. Then on the VM:

```bash
mkdir -p ~/.kaggle && mv ~/kaggle.json ~/.kaggle/ && chmod 600 ~/.kaggle/kaggle.json
mkdir -p ~/data/raw && cd ~/data/raw
kaggle datasets download -d asaniczka/1-3m-linkedin-jobs-and-skills-2024 -p linkedin-2024 --unzip
kaggle datasets download -d arshkon/linkedin-job-postings -p linkedin-arshkon --unzip
gcloud storage rsync --recursive ~/data/raw $BUCKET/raw
```

These are the folders named `archive (4)` and `archive (3)` on the laptop.

## 4. Clean the job postings in BigQuery

Loading reads from the bucket inside Google's network, so these commands are
fast even from the laptop.

```bash
bq mk --dataset --location=$REGION $PROJECT:resume_data
bq load --source_format=CSV --autodetect --allow_quoted_newlines --skip_leading_rows=1 \
  --max_bad_records=1000 resume_data.linkedin_postings_raw \
  "$BUCKET/raw/linkedin-2024/linkedin_job_postings.csv"
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

## 5. Prepare the resume data (on the VM)

```bash
gcloud storage cp $BUCKET/raw/resume-data.tgz ~/data/ && tar xzf ~/data/resume-data.tgz -C ~/data/raw
cd ~/Smart-Resume-Analyzer-and-Job-Recommendation-System/ml-service
python -m training.data_prep.build --datasets-dir ~/data/raw --out ~/data/prepared
gcloud storage rsync --recursive ~/data/prepared $BUCKET/prepared
```

What the build does and how to read its report: [data_prep/README.md](data_prep/README.md).

## 6. Gemini labelling (on the VM)

The VM's service account is its Google login, so the ML service code finds
credentials with no setup. Set `GOOGLE_CLOUD_PROJECT=$PROJECT` and
`GOOGLE_CLOUD_LOCATION=global` in `ml-service/.env`.

Before any full labelling run, follow the cost rule: run
`scripts/llm_cost_check.py` as a dry run, then on a small real sample, and
compare the assumed cost with the actual cost.

## 7. Stop paying when done

A stopped VM costs only its 50 GB disk, a few dollars a month. Delete it when the
data work is finished; the bucket keeps every result.

```bash
gcloud compute instances stop data-prep-vm --zone=$ZONE
gcloud compute instances delete data-prep-vm --zone=$ZONE   # when finished
```

## 8. Later: GPU training

Training needs an NVIDIA T4 GPU. Free-trial accounts cannot attach GPUs, so
upgrade the billing account first (the remaining credit carries over), then
request GPU quota (`GPUS_ALL_REGIONS` and T4 in `asia-south1`) in the console
under IAM & Admin → Quotas. Approval can take a day. The VM setup is in
[README.md](README.md) §2.
